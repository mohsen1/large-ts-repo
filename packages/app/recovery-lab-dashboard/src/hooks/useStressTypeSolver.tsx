import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildConstraintChain,
  solveWithConstraint,
} from '@shared/type-level';
import { compileTemplateCatalog, routePreviews, type RoutePipelinePreview } from '@shared/type-level/stress-conditional-depth-grid';
import { controlFlowHarness } from '@domain/recovery-lab-synthetic-orchestration';

type SolverMode = 'preview' | 'replay' | 'stress';
type SolverModeMap = Record<SolverMode, number>;
type SolverAction = 'start' | 'pause' | 'abort';

type SolvedPreview<T extends string> = {
  readonly route: T;
  readonly raw: string;
  readonly action: string;
  readonly depth: number;
  readonly routeUnion: string;
};

export type StressTraceRow = {
  readonly route: string;
  readonly raw: string;
  readonly action: string;
  readonly depth: number;
  readonly routeUnion: string;
};

export type UseStressTypeSolverProps = {
  readonly mode: SolverMode;
  readonly attempts: number;
};

export type StressSolverState = {
  readonly traces: readonly StressTraceRow[];
  readonly mode: SolverMode;
  readonly loading: boolean;
  readonly error: string | null;
  readonly action: SolverAction;
};

type SolverActionMap = {
  readonly start: SolverAction;
  readonly pause: SolverAction;
  readonly abort: SolverAction;
};

const modeDepths: SolverModeMap = {
  preview: 2,
  replay: 5,
  stress: 10,
};

const actionStyle: SolverActionMap = {
  start: 'start',
  pause: 'pause',
  abort: 'abort',
};

const routeInputCatalog = Object.fromEntries(
  routePreviews.map((preview) => [
    preview.route,
    {
      route: preview.route,
      fingerprint: preview.fingerprint,
      parsed: preview.parsed,
    },
  ]),
) as Record<string, { route: string; fingerprint: string; parsed: RoutePipelinePreview['parsed'] }>;

const compile = compileTemplateCatalog(routeInputCatalog) as unknown as Record<string, { route: string; fingerprint: string; parsed: RoutePipelinePreview['parsed'] }>;
const traced = Object.entries(compile).map(([key, value]) => {
  const template = key as string;
  const payload = value as { fingerprint: string; parsed: RoutePipelinePreview['parsed']; route: string };
  return {
    route: template,
    raw: payload.fingerprint,
    action: 'computed',
    depth: template.length + payload.fingerprint.length,
    routeUnion: String(payload.parsed['raw']),
  } satisfies SolvedPreview<string>;
});

export const useStressTypeSolver = ({ mode, attempts }: UseStressTypeSolverProps): {
  readonly traces: readonly StressTraceRow[];
  readonly mode: SolverMode;
  readonly loading: boolean;
  readonly error: string | null;
  readonly action: SolverAction;
  readonly controls: {
    readonly start: () => void;
    readonly pause: () => void;
    readonly abort: () => void;
  };
} => {
  const [traces, setTraces] = useState<readonly StressTraceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<SolverAction>('pause');
  const [loading, setLoading] = useState<boolean>(false);

  const depth = modeDepths[mode];
  const modeAction = actionStyle[action];

  const routeMatrix = useMemo(() => {
    const preview = buildConstraintChain('recovery-lab', ['discover', 'assess', 'route', 'verify', 'notify'] as const);
    return routePreviews.slice(0, 12).map((entry, index) => ({
      route: entry.route,
      raw: entry.fingerprint,
      action: String(preview.trace[index] ?? 'unknown'),
      depth,
      routeUnion: String(preview.trace[index] ?? entry.parsed['raw']),
    }));
  }, [depth]);

  const runSolver = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
    const payload = await solveWithConstraint('recovery-lab', [
        'discover',
        'assess',
        'restore',
        'verify',
        'archive',
      ] as const);
      const decision = controlFlowHarness(
        {
          tenant: 'tenant-stress',
          routes: routePreviews.map((entry) => entry.route),
          mode: 'sim' as const,
          attempt: attempts,
        },
        [
          { kind: 'bool', opcode: 'boot', tenant: 'tenant-stress', runId: 'run-1', attempt: 1, payload: true },
          {
            kind: 'text',
            opcode: 'route',
            tenant: 'tenant-stress',
            runId: 'run-2',
            attempt: 2,
            payload: '/recovery/route/abc',
          },
          {
            kind: 'route',
            opcode: 'recover',
            tenant: 'tenant-stress',
            runId: 'run-3',
            attempt: 3,
            payload: { path: '/recovery', domain: 'recovery' },
          },
        ],
      );
      const out = decision.decisions.flatMap((branch) =>
        branch.accepted.map((step) => ({
          route: step.route,
          raw: payload.domain,
          action: `${step.branch}-${step.phase}`,
          depth: step.weight,
          routeUnion: String(step.opcode),
        })),
      );
      setTraces([...traced, ...out, ...routeMatrix]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'solver-failure');
      setTraces([]);
    } finally {
      setLoading(false);
    }
  }, [attempts, routeMatrix]);

  useEffect(() => {
    if (mode === 'preview' && action === 'pause') {
      return;
    }
    if (modeAction === 'start' || mode === 'stress') {
      void runSolver();
    }
  }, [action, mode, modeAction, runSolver]);

  const controls = useMemo(
    () => ({
      start: () => setAction('start'),
      pause: () => setAction('pause'),
      abort: () => setAction('abort'),
    }),
    [],
  );

  return {
    traces,
    mode,
    loading,
    error,
    action: modeAction,
    controls,
  };
};
