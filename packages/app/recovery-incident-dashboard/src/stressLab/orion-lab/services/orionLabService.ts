import type { OrbiRoute } from '@shared/type-level/stress-orion-constellation';
import type { DecisionRoute } from '@shared/type-level/stress-orion-controlflow';
import type { OrbiCommand } from '@shared/type-level/stress-orion-instantiator';
import type { HubCatalogByCommand, HubNodeEnvelope } from '@shared/type-level-hub';
import type { OrionLabState, OrionRunMetrics, OrionWorkItem, OrionTimelineEvent } from '../types';
import {
  defaultOrionRuntimeConfig,
  type OrionWorkspaceState,
} from '../types';
import {
  buildOrbiPayload,
  orbiCatalogSource,
  orbiProfileCatalog,
} from '@shared/type-level/stress-orion-constellation';
import { solveConstraintSeries } from '@shared/type-level/stress-orion-constraints';
import { constraintCatalog } from '@shared/type-level/stress-orion-constraints';
import { eventProfiles } from '@shared/type-level/stress-orion-template-math';
import { controlBranches, controlDecision } from '@shared/type-level/stress-orion-controlflow';
import { instantiateAtScale } from '@shared/type-level/stress-orion-instantiator';

const bootstrapEnvelope = {
  token: 'orion-bootstrap',
  startedAt: Date.now(),
};

export class OrionLabSession {
  #closed = false;
  readonly startedAt: number;

  constructor(readonly id: string, private readonly disposer?: { [Symbol.dispose](): void }) {
    this.startedAt = Date.now();
  }

  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.disposer?.[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

class AsyncOrionScope {
  readonly #children: Array<Promise<void>> = [];

  async [Symbol.asyncDispose](): Promise<void> {
    await Promise.all(this.#children);
  }

  register(promise: Promise<void>): void {
    this.#children.push(promise);
  }
}

export const createOrionSession = (id: string): OrionLabSession => {
  const asyncScope = new AsyncOrionScope();
  return new OrionLabSession(id, {
    [Symbol.dispose](): void {
      void asyncScope[Symbol.asyncDispose]();
    },
  });
};

const routeResolver = buildOrbiPayload(orbiCatalogSource);
const profile = orbiProfileCatalog;
const commandCatalogRoutes = [
  '/incident/compose/tag-orion-001',
  '/workflow/simulate/tag-orion-002',
  '/fabric/verify/tag-orion-003',
  '/policy/reconcile/tag-orion-004',
  '/telemetry/observe/tag-orion-005',
  '/safety/archive/tag-orion-006',
  '/safety/archive/tag-orion-007',
] as const satisfies readonly OrbiCommand[];
const commandPayload = instantiateAtScale('incident', commandCatalogRoutes);

const commandCatalog = {
  commands: commandCatalogRoutes,
  payload: commandPayload,
} satisfies HubCatalogByCommand<readonly OrbiCommand[]>;

const commandNode: HubNodeEnvelope = {
  orbit: {
    marker: 'root',
    stage: 40,
    token: 'forty',
  },
  stage: 40,
  marker: 'hub',
};

const constraintSeries = solveConstraintSeries(constraintCatalog);

const boot = {
  profile,
  routeResolver,
  commandCatalog,
  eventProfiles: eventProfiles.slice(),
  controlBranches,
  constraints: constraintSeries.length,
  bootstrap: bootstrapEnvelope,
};

export const createInitialState = (): OrionLabState => {
  const now = new Date().toISOString();
  const initialState: OrionLabState = {
    config: defaultOrionRuntimeConfig,
    routeResolver,
    commandCatalog,
    commandNode,
    activeWorkItem: null,
    activeCommand: null,
    status: 'idle',
    items: orbiProfileCatalog.map((entry) => ({
      route: entry.route,
      profile: entry,
      expectedState: 'discovering',
      startedAt: now,
      severity: entry.severity,
    }) satisfies OrionWorkItem),
    timeline: [
      {
        id: 'orion-workspace-alpha',
        stage: 'idle',
        emittedAt: now,
        envelope: {
          kind: 'route',
          route: orbiCatalogSource[0]!,
          parts: orbiProfileCatalog[0]!.parts,
          payload: orbiProfileCatalog[0]!,
          generated: orbiProfileCatalog[0]!,
        },
      } satisfies OrionTimelineEvent,
    ],
    metrics: {
      executed: 0,
      succeeded: 0,
      failed: [],
      lastTick: now,
      latencyMs: 0,
    },
  };

  void boot.eventProfiles;
  void boot.controlBranches;
  void boot.commandCatalog;
  void boot.constraints;
  void boot.bootstrap.token;
  return initialState;
};

const computeLatency = (start: number, end: number): number => Math.max(0, end - start);

export const executeOrionCommand = async (
  route: OrbiRoute,
  status: OrionWorkspaceState,
  onDecision: (state: OrionWorkspaceState) => void,
): Promise<OrionWorkItem> => {
  const now = new Date();
  const branch = controlDecision({
    source: 'orion-exec',
    ts: now.getTime(),
    signal: 'delta',
    stage: 'simulate',
    payload: { score: 76, confidence: 0.84, active: true },
  });
  const resolveState = (selected: DecisionRoute): OrionWorkspaceState => {
    switch (selected) {
      case 'default-route':
        return 'error';
      case 'final':
        return 'complete';
      case 'bootstrap':
        return 'routing';
      case 'alpha-route':
      case 'priority-route':
      case 'expensive-route':
      case 'maintenance-route':
      case 'safety-route':
      case 'policy-route':
      case 'orchestration-route':
      case 'sweep-route':
        return 'observing';
      default:
        return status;
    }
  };

  onDecision(resolveState(branch.route));

  if (branch?.branch?.allowed ?? false) {
    const nextProfile = buildOrbiPayload([route])[0] as OrionWorkItem['profile'];

    return {
      route,
      profile: nextProfile,
      expectedState: 'executing',
      startedAt: now.toISOString(),
      severity: nextProfile.severity,
    } satisfies OrionWorkItem;
  }

  throw new Error('command rejected by control decision');
};

export const updateMetrics = (prev: OrionRunMetrics, now: OrionRunMetrics): OrionRunMetrics => {
  const parseDate = (value: string) => Date.parse(value);
  return {
    executed: prev.executed + now.executed,
    succeeded: prev.succeeded + now.succeeded,
    failed: [...prev.failed, ...now.failed],
    lastTick: now.lastTick,
    latencyMs: computeLatency(parseDate(prev.lastTick), parseDate(now.lastTick)),
  };
};
