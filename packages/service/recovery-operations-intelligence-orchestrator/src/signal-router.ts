import type { OrchestrationTag, OrchestratedSignalGroup, BucketedWindow, CohortBucket } from './orchestration-types';
import type { RecoveryRiskSignal } from '@domain/recovery-operations-intelligence';
import type { ScoreScale, TenantId } from './orchestration-types';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';

export interface RoutedBatch {
  readonly runId: string;
  readonly tenant: string;
  readonly windows: ReadonlyArray<string>;
  readonly buckets: ReadonlyArray<CohortBucket>;
  readonly totalSignals: number;
}

export interface RoutingPlan {
  readonly batch: RoutedBatch;
  readonly routeByTag: BucketedWindow<OrchestrationTag>;
  readonly order: readonly OrchestrationTag[];
}

interface SeverityWindow {
  readonly from: number;
  readonly to: number;
  readonly bucketLabel: OrchestrationTag;
}

const windowDefinitions: readonly SeverityWindow[] = [
  { from: 0, to: 3, bucketLabel: 'telemetry' },
  { from: 3, to: 6, bucketLabel: 'policy' },
  { from: 6, to: 8, bucketLabel: 'risk' },
  { from: 8, to: 11, bucketLabel: 'safety' },
] as const;

const scoreToBucket = (severity: number): OrchestrationTag => {
  const matching = windowDefinitions.find((entry) => severity >= entry.from && severity < entry.to);
  return matching?.bucketLabel ?? 'ops';
};

const toWindowBucket = (signals: readonly RecoveryRiskSignal[]): BucketedWindow<OrchestrationTag> => {
  const buckets: BucketedWindow<OrchestrationTag> = {
    risk: [],
    telemetry: [],
    policy: [],
    safety: [],
    ops: [],
  };

  for (const signal of signals) {
    const key = scoreToBucket(signal.signal.severity) as OrchestrationTag;
    const current = buckets[key];
    buckets[key] = [...current, signal];
  }

  return buckets;
};

const collectBuckets = (
  routes: BucketedWindow<OrchestrationTag>,
  tenant: string,
  runId: string,
): readonly CohortBucket[] => {
  return (Object.keys(routes) as OrchestrationTag[]).map((key) => {
    const signalList = routes[key] as readonly RecoveryRiskSignal[];
    const rawScore = signalList.reduce((acc, signal) => acc + signal.signal.severity, 0);
    const score = (rawScore / Math.max(1, signalList.length)) as ScoreScale;
    return {
      tag: key,
      score,
      signals: signalList,
      assessments: signalList.map((signal) => ({
        runId: signal.runId,
        tenant: String(signal.window.tenant),
        riskScore: signal.signal.severity,
        confidence: signal.signal.confidence,
        bucket: 'low',
        intensity: {
          bucket: 'low',
          averageSeverity: signal.signal.severity,
          signalCount: 1,
        },
        constraints: {
          maxParallelism: Math.max(1, Math.round(signal.signal.severity)),
          maxRetries: 3,
          timeoutMinutes: 30,
          operatorApprovalRequired: signal.signal.severity > 8,
        },
        recommendedActions: [key, 'review'],
        plan: ({
          id: signal.envelopeId as RunPlanSnapshot['id'],
          name: `${tenant}-${runId}` as RunPlanSnapshot['name'],
          constraints: {
            maxParallelism: 3,
            maxRetries: 3,
            timeoutMinutes: 10,
            operatorApprovalRequired: false,
          },
          program: {
            id: `${signal.runId}` as never,
            name: `${tenant}-${signal.envelopeId}` as never,
            steps: [],
            source: tenant,
            owner: tenant,
            metadata: { origin: signal.source },
          } as never,
          fingerprint: {
            tenant: signal.window.tenant,
            region: 'us-east-1',
            serviceFamily: 'recovery',
            impactClass: 'infrastructure',
            estimatedRecoveryMinutes: 10,
          } as never,
          sourceSessionId: undefined,
          effectiveAt: signal.window.from,
        } as RunPlanSnapshot),
      })),
    };
  });
};

const buildWindows = (signals: readonly RecoveryRiskSignal[]): readonly string[] => {
  const map = new Map<string, number>();

  for (const signal of signals) {
    const dateKey = `${signal.window.from}::${signal.window.to}::${signal.window.zone}`;
    map.set(dateKey, (map.get(dateKey) ?? 0) + 1);
  }

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)
    .slice(0, 12);
};

export const routeSignals = (
  tenant: string,
  runId: string,
  signals: readonly RecoveryRiskSignal[],
): RoutingPlan => {
  const routeByTag = toWindowBucket(signals);
  const buckets = collectBuckets(routeByTag, tenant, runId);
  const totalSignals = signals.length;
  const windows = buildWindows(signals);
  const order = (Object.keys(routeByTag) as OrchestrationTag[])
    .filter((key) => routeByTag[key].length > 0)
    .sort((left, right) => routeByTag[right].length - routeByTag[left].length);

  return {
    batch: {
      runId,
      tenant,
      windows,
      buckets,
      totalSignals,
    },
    routeByTag,
    order,
  };
};

export const orchestrateSignalGroups = (routing: RoutingPlan): readonly OrchestratedSignalGroup[] =>
  routing.order.map((tag) => ({
    tenant: routing.batch.tenant as TenantId,
    runId: routing.batch.runId,
    tag,
    signals: routing.routeByTag[tag],
  }));
