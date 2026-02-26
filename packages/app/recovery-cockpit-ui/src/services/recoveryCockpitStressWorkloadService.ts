import { setTimeout as nodeSetTimeout } from 'node:timers/promises';
import type {
  Brand,
  DeepReadonly,
  Optionalize,
  PathValue,
} from '@shared/type-level';
import type { OrbitRoute } from '@shared/type-level';

export type StressDomainId = Brand<string, 'domain-id'>;
export type StressRunId = Brand<string, 'run-id'>;

export type StressRouteRecord = {
  readonly route: OrbitRoute;
  readonly owner: string;
  readonly enabled: boolean;
};

export type StressWorkbenchInput = {
  readonly tenantId: StressDomainId;
  readonly runId: StressRunId;
  readonly routeMap: Record<StressRunId, StressRouteRecord>;
  readonly baseline: number;
};

export type StressPlanResult = {
  readonly tenantId: StressDomainId;
  readonly runId: StressRunId;
  readonly resolved: readonly StressResolvedPlan[];
  readonly elapsedMs: number;
  readonly correlation: number;
};

export type WorkloadMetrics = {
  readonly routeCount: number;
  readonly activeCount: number;
  readonly disabledCount: number;
  readonly averageLatency: number;
};

export type StressEvaluationResult = WorkloadMetrics & {
  readonly runId: StressRunId;
  readonly profile: string;
};

type RouteCatalog = ReadonlyArray<{
  readonly runId: StressRunId;
  readonly route: OrbitRoute;
  readonly owner: string;
  readonly enabled: boolean;
}>;

const stressRunId = (raw: string): StressRunId => raw as StressRunId;

export const warmRouteCatalog = [
  {
    runId: stressRunId('stress-run-1'),
    route: '/agent/simulate/warming/alpha/agent-simulate-1',
    owner: 'runtime',
    enabled: true,
  },
  {
    runId: stressRunId('stress-run-2'),
    route: '/orchestrator/reconcile/degraded/beta/orchestrator-reconcile-2',
    owner: 'planner',
    enabled: true,
  },
  {
    runId: stressRunId('stress-run-3'),
    route: '/mesh/restore/active/stable/mesh-restore-3',
    owner: 'mesh',
    enabled: false,
  },
  {
    runId: stressRunId('stress-run-4'),
    route: '/signal/triage/recovering/release/signal-triage-4',
    owner: 'signal',
    enabled: true,
  },
  {
    runId: stressRunId('stress-run-5'),
    route: '/telemetry/audit/terminated/release/telemetry-audit-5',
    owner: 'audit',
    enabled: false,
  },
] as const satisfies RouteCatalog;

export type StressResolvedPlan = {
  readonly command: 'bootstrap' | 'schedule' | 'preheat' | 'contain' | 'restore' | 'execute' | 'finalize';
  readonly domainAffinity: string;
  readonly actionClass: string;
  readonly executionPhase: string;
  readonly route: OrbitRoute;
};

class StressScope implements AsyncDisposable {
  public readonly startedAt = Date.now();
  public async [Symbol.asyncDispose](): Promise<void> {
    await nodeSetTimeout(0);
  }
}

export const resolveWorkbenchInput = (tenantId: string): StressWorkbenchInput => {
  const map = Object.fromEntries(
    warmRouteCatalog.map((entry) => [entry.runId, entry]),
  ) as StressWorkbenchInput['routeMap'];
  return {
    tenantId: tenantId as StressDomainId,
    runId: stressRunId('stress-run-main') as StressRunId,
    routeMap: map,
    baseline: 1200,
  };
};

export const collectRoutePlans = async (
  input: StressWorkbenchInput,
): Promise<StressPlanResult> => {
  const start = performance.now();
  const resolved: StressResolvedPlan[] = [];
  const handle = new StressScope();
  await using scoped = handle;

  try {
    for (const route of Object.values(input.routeMap)) {
      await nodeSetTimeout(1);
      if (!route.enabled) {
        continue;
      }
      resolved.push({
        command: 'execute',
        domainAffinity: 'runtime-plane',
        actionClass: 'generic',
        executionPhase: 'stable',
        route: route.route,
      } as StressResolvedPlan);
    }
  } finally {
    await scoped[Symbol.asyncDispose]();
  }

  const elapsedMs = Math.round(performance.now() - start);
  return {
    tenantId: input.tenantId,
    runId: input.runId,
    resolved,
    elapsedMs,
    correlation: handle.startedAt ^ 0xfeedface,
  };
};

export const summarizeMetrics = (result: StressPlanResult): WorkloadMetrics => {
  const active = result.resolved.length;
  return {
    routeCount: warmRouteCatalog.length,
    activeCount: active,
    disabledCount: warmRouteCatalog.length - active,
    averageLatency: result.elapsedMs / Math.max(1, warmRouteCatalog.length),
  };
}

type WorkloadPath = 'tenantId' | 'runId' | 'routeMap';

const pathGetters = {
  tenantId: (input: StressWorkbenchInput) => input.tenantId,
  runId: (input: StressWorkbenchInput) => input.runId,
  routeMap: (input: StressWorkbenchInput) => input.routeMap,
} as const;

export type WorkloadPathValue<T extends WorkloadPath> = PathValue<StressWorkbenchInput, T>;

export const getWorkloadPath = <T extends WorkloadPath>(input: StressWorkbenchInput, key: T): WorkloadPathValue<T> =>
  pathGetters[key](input) as WorkloadPathValue<T>;

export const buildEvaluation = (
  input: StressWorkbenchInput,
  metrics: WorkloadMetrics,
): StressEvaluationResult =>
  ({
    runId: input.runId,
    profile: 'stress-workload',
    ...metrics,
  }) as StressEvaluationResult;

export type StressPlanEnvelope<TPayload extends StressWorkbenchInput> = DeepReadonly<{
  payload: TPayload;
  metrics: WorkloadMetrics;
}>;

export const optionalizePlan = <T extends StressWorkbenchInput>(
  payload: T,
): Optionalize<StressPlanEnvelope<T>, 'metrics'> => ({
  payload: payload as StressPlanEnvelope<T>['payload'],
});
