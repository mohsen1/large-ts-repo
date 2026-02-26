import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { branchRouter, createBranchEvent, walkFlow } from '@shared/type-level';
import {
  type DomainMetadata,
  type DomainToken,
} from '@shared/type-level/stress-conditional-lattice';
import type { FlowEventCode } from '@shared/type-level/stress-control-graph';
import {
  type StressTypeCommandRow,
  type StressTypeLabMode,
  type StressTypeLabSeed,
  type StressTypeLabSnapshot,
  defaultModeSequence,
  defaultSnapshot,
  buildSeedRows,
  commandBuckets,
  resolveFrom,
} from '../types/stressTypeLabSchema';

type SeedCatalogRow = {
  readonly domain: DomainToken;
  readonly index: number;
  readonly stamp: number;
};

const startupSeedCatalog = ['atlas', 'continuity', 'chronicle', 'drill', 'fabric', 'forecast', 'incident', 'policy', 'risk', 'signal', 'timeline'].map(
  (domain, index) => ({
    domain: domain as DomainToken,
    index,
    stamp: Date.now() + index,
  }),
);

type StressTypeEvent =
  | { readonly type: 'set-mode'; readonly mode: StressTypeLabMode }
  | { readonly type: 'enqueue-command'; readonly row: StressTypeCommandRow }
  | { readonly type: 'run'; readonly steps: number }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'clear' }
  | { readonly type: 'refresh-seed'; readonly seed: StressTypeLabSeed }
  | { readonly type: 'mark-degraded'; readonly reason: string; readonly severity: number }
  | { readonly type: 'mark-stable'; readonly score: number };

interface StressTypeState {
  readonly snapshot: StressTypeLabSnapshot;
  readonly mode: StressTypeLabMode;
  readonly running: boolean;
  readonly runToken: number;
  readonly tick: number;
}

const createBranchEventCatalog = (catalog: readonly SeedCatalogRow[]): ReadonlyArray<{
  readonly code: FlowEventCode;
  readonly event: ReturnType<typeof createBranchEvent>;
}> =>
  catalog.map((entry) => ({
    code: `evt-${String(entry.index % 72).padStart(2, '0')}` as FlowEventCode,
    event: createBranchEvent(`evt-${String(entry.index % 72).padStart(2, '0')}` as FlowEventCode, entry.stamp % 100, 'ingest'),
  }));

const reducer = (state: StressTypeState, event: StressTypeEvent): StressTypeState => {
  switch (event.type) {
    case 'set-mode':
      return {
        ...state,
        mode: event.mode,
        snapshot: {
          ...state.snapshot,
          lane: defaultModeSequence,
        },
      };
    case 'enqueue-command':
      return {
        ...state,
        snapshot: {
          ...state.snapshot,
          commands: [...state.snapshot.commands, event.row],
        },
      };
    case 'run': {
      const score = event.steps + state.runToken;
      const domain = state.snapshot.seed.domain;
      const resolved = resolveFrom(domain, `${domain}:route` as const);
      return {
        ...state,
        running: score % 2 === 1,
        runToken: score,
        snapshot: {
          ...state.snapshot,
          resolved: {
            ...resolved,
            metadata: {
              ...resolved.metadata,
              tags: [...resolved.metadata.tags, resolved.domain],
            },
            action: `${resolved.domain}:route`,
          },
        },
      };
    }
    case 'pause':
      return {
        ...state,
        running: false,
        tick: state.tick + 1,
      };
    case 'resume':
      return {
        ...state,
        running: true,
        tick: state.tick + 1,
      };
    case 'clear':
      return {
        ...state,
        snapshot: {
          ...state.snapshot,
          commands: [],
        },
        running: false,
        tick: 0,
      };
    case 'refresh-seed':
      return {
        ...state,
        snapshot: {
          ...defaultSnapshot(event.seed.tenant, state.mode),
          seed: event.seed,
          commands: buildSeedRows(event.seed),
          lane: defaultModeSequence,
        },
      };
    case 'mark-degraded':
      return {
        ...state,
        running: false,
        tick: state.tick + Math.max(0, event.severity),
        snapshot: {
          ...state.snapshot,
          lane: [...state.snapshot.lane],
        },
      };
    case 'mark-stable':
      return {
        ...state,
        running: false,
        tick: event.score,
        snapshot: {
          ...state.snapshot,
          lane: [...state.snapshot.lane],
        },
      };
    default:
      return state;
  }
};

export interface StressTypeHook {
  readonly state: StressTypeState;
  readonly commandBuckets: { readonly low: readonly string[]; readonly mid: readonly string[]; readonly high: readonly string[] };
  readonly branchOutcomes: ReturnType<typeof branchRouter>[];
  readonly metrics: {
    readonly mode: StressTypeLabMode;
    readonly queueSize: number;
    readonly resolvedCount: number;
    readonly pressure: number;
  };
  readonly setMode: (mode: StressTypeLabMode) => void;
  readonly enqueue: (row: StressTypeCommandRow) => void;
  readonly run: (steps: number) => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly clear: () => void;
}

export const useStressTypeOrchestrator = (tenant: string, initialMode: StressTypeLabMode): StressTypeHook => {
  const seed = useMemo(() => {
    const base = defaultSnapshot(tenant, initialMode);
    const rows = buildSeedRows(base.seed);
    return {
      ...base,
      commands: rows,
    };
  }, [tenant, initialMode]);

  const startupEvents = useMemo(() => createBranchEventCatalog(startupSeedCatalog), []);
  const branchEvents = startupEvents.map((entry) => entry.event);

  const [state, dispatch] = useReducer(reducer, {
    snapshot: seed,
    mode: initialMode,
    runToken: 0,
    running: false,
    tick: 0,
  });

  const setMode = useCallback((mode: StressTypeLabMode) => dispatch({ type: 'set-mode', mode }), []);
  const enqueue = useCallback((row: StressTypeCommandRow) => dispatch({ type: 'enqueue-command', row }), []);
  const run = useCallback((steps: number) => dispatch({ type: 'run', steps }), []);
  const pause = useCallback(() => dispatch({ type: 'pause' }), []);
  const resume = useCallback(() => dispatch({ type: 'resume' }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const branchOutcomes = useMemo(
    () => branchEvents.map((entry) => branchRouter(entry)),
    [state.tick],
  );

  const buckets = useMemo(() => commandBuckets(state.snapshot.commands), [state.snapshot.commands]);

  const metrics = useMemo(
    () => ({
      mode: state.mode,
      queueSize: state.snapshot.commands.length,
      resolvedCount: state.snapshot.commands.filter((command) => command.active).length,
      pressure: state.tick % 100,
    }),
    [state.mode, state.snapshot.commands.length, state.tick],
  );

  useEffect(() => {
    if (!state.running) {
      return;
    }

    const handle = setInterval(() => {
      const fallbackCode = `evt-${String(state.tick % 72).padStart(2, '0')}` as FlowEventCode;
      const event = branchEvents[state.tick % branchEvents.length] ?? createBranchEvent(fallbackCode, state.tick, 'route');
      const route = branchRouter(event);
      walkFlow(fallbackCode, state.tick);
      if (route.shouldPause) {
        dispatch({ type: 'pause' });
      }
      if (route.shouldEscalate) {
        dispatch({ type: 'mark-degraded', reason: route.label, severity: route.scoreModifier });
      }
    }, 1000);

    return () => clearInterval(handle);
  }, [state.running, state.tick, branchEvents]);

  return {
    state,
    commandBuckets: buckets,
    branchOutcomes,
    metrics,
    setMode,
    enqueue,
    run,
    pause,
    resume,
    clear,
  };
};

export const useStressTypeRuntime = async (tenant: string): Promise<string> => {
  if (tenant.length === 0) {
    return Promise.reject(new Error('missing tenant'));
  }
  const session = await Promise.resolve({ token: `session-${tenant}-${Date.now()}` });
  return session.token;
};
