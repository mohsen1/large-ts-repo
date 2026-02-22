import { z } from 'zod';
import { AdaptivePolicy, SignalSample, SignalKind, AdaptiveDecision, AdaptiveAction, DriftDirection } from './types';
import { mergeActions, createAdaptationPlan } from './surface';

export interface ServiceSignalBucket {
  serviceId: string;
  samples: readonly SignalSample[];
}

export interface WorkflowWindow {
  start: string;
  end: string;
  timezone: string;
}

export interface ActionConflict {
  serviceId: string;
  actionTypes: readonly AdaptiveAction['type'][];
}

export interface WorkflowOutcome {
  tenantId: string;
  window: WorkflowWindow;
  policies: readonly AdaptivePolicy[];
  signals: readonly SignalSample[];
  planActions: readonly AdaptiveAction[];
  decisions: readonly AdaptiveDecision[];
  conflictMatrix: readonly ActionConflict[];
  coverageRatio: number;
}

const nonEmpty = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

const workflowInputSchema = z.object({
  tenantId: z.string().min(1),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  timezone: z.string().min(1),
  policies: z.array(z.string()).min(1),
  driftDirection: z.enum(['up', 'down']).optional(),
  minCoverage: z.number().min(0).max(1).optional(),
});

export type WorkflowInput = z.infer<typeof workflowInputSchema>;

export const parseWorkflowInput = (value: unknown): WorkflowInput => workflowInputSchema.parse(value);

export const bucketByService = (samples: readonly SignalSample[]): readonly ServiceSignalBucket[] => {
  const buckets = new Map<string, SignalSample[]>();
  for (const sample of samples) {
    const key = sample.kind;
    const existing = buckets.get(key);
    if (existing) {
      existing.push(sample);
    } else {
      buckets.set(key, [sample]);
    }
  }

  return Array.from(buckets.entries()).map(([serviceId, serviceSamples]) => ({
    serviceId,
    samples: serviceSamples,
  }));
};

export const summarizeBucketLoad = (bucket: ServiceSignalBucket): number => {
  if (bucket.samples.length === 0) return 0;

  const total = bucket.samples.reduce((acc, sample) => acc + Math.abs(sample.value), 0);
  return total / bucket.samples.length;
};

export const identifyConflict = (decisions: readonly AdaptiveDecision[]): readonly ActionConflict[] => {
  const grouped = new Map<string, Set<AdaptiveAction['type']>>();
  for (const decision of decisions) {
    for (const action of decision.selectedActions) {
      const service = action.targets[0] ?? 'global';
      const next = grouped.get(service) ?? new Set<AdaptiveAction['type']>();
      next.add(action.type);
      grouped.set(service, next);
    }
  }

  return Array.from(grouped.entries())
    .map(([serviceId, actions]) => ({
      serviceId,
      actionTypes: Array.from(actions),
    }))
    .filter((entry) => entry.actionTypes.length > 1);
}

export const rankSignals = (samples: readonly SignalSample[], kindOrder: readonly SignalKind[]): readonly SignalSample[] => {
  const order = new Map(kindOrder.map((kind, index) => [kind, index]));
  return [...samples].sort((left, right) => {
    const leftRank = order.get(left.kind) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = order.get(right.kind) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank === rightRank) {
      return right.value - left.value;
    }
    return leftRank - rightRank;
  });
};

export const computeCoverageRatio = (decisions: readonly AdaptiveDecision[], policies: readonly AdaptivePolicy[]): number => {
  if (policies.length === 0) return 0;
  const touchedPolicies = new Set<string>(decisions.map((decision) => decision.policyId));
  return touchedPolicies.size / policies.length;
};

export const buildWorkflowOutcome = (
  tenantId: string,
  window: WorkflowWindow,
  policies: readonly AdaptivePolicy[],
  signals: readonly SignalSample[],
  driftDirection?: DriftDirection,
  minCoverage = 0.25,
): WorkflowOutcome => {
  const rankedSignals = rankSignals(
    signals,
    driftDirection === 'down'
      ? ['availability', 'error-rate', 'latency', 'cost-variance', 'manual-flag']
      : ['error-rate', 'latency', 'availability', 'cost-variance', 'manual-flag'],
  );
  const decisionContext = policies;
  const plan = createAdaptationPlan({
    tenantId,
    signals: rankedSignals,
    policies: decisionContext,
    context: {
      tenantId: tenantId as never,
      window: {
        startsAt: window.start,
        endsAt: window.end,
        zone: window.timezone,
      },
      services: policies.flatMap((policy) => policy.dependencies.map((dependency) => dependency.serviceId)),
    },
  });
  const merged = mergeActions([...plan.actions], []);
  const coverageRatio = computeCoverageRatio(plan.decisions, policies);

  const filteredActions = merged.filter((action: AdaptiveAction) => action.intensity >= minCoverage);

  const decisions = plan.decisions.filter((decision: AdaptiveDecision) => decision.confidence >= minCoverage);
  const conflictMatrix = identifyConflict(decisions);

  return {
    tenantId,
    window,
    policies,
    signals,
    planActions: filteredActions,
    decisions,
    conflictMatrix,
    coverageRatio,
  };
};

export const extractCriticalDecisions = (decisions: readonly AdaptiveDecision[]): readonly AdaptiveDecision[] => {
  return decisions.filter((decision) => decision.risk === 'high' || decision.risk === 'critical');
};

export const resolveDecisions = (
  decisions: readonly AdaptiveDecision[],
  maxRisk: AdaptiveDecision['risk'],
): readonly AdaptiveDecision[] => {
  if (maxRisk === 'critical') return decisions;

  const maxRiskPriority = ['low', 'medium', 'high', 'critical'] as const;
  const maxIndex = maxRiskPriority.indexOf(maxRisk);
  return decisions.filter((decision) => maxRiskPriority.indexOf(decision.risk) <= maxIndex);
};

export const buildTimeline = (signals: readonly SignalSample[]): readonly SignalSample[] => {
  return [...signals].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
};

export const inferDrift = (signals: readonly SignalSample[]): DriftDirection | 'none' => {
  if (signals.length < 2) return 'none';
  const sorted = buildTimeline(signals);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return 'none';
  if (last.value > first.value) return 'up';
  if (last.value < first.value) return 'down';
  return 'none';
};

export const enrichOutcome = (
  outcome: WorkflowOutcome,
  filters: readonly SignalKind[] | null,
): WorkflowOutcome => {
  const filterSet = new Set(filters ?? []);
  const resolvedSignals = filters ? outcome.signals.filter((signal) => filterSet.has(signal.kind)) : outcome.signals;
  const resolvedDecisions = filters
    ? outcome.decisions.filter((decision) =>
        decision.selectedActions.some((action) => action.targets.some((target) => filterSet.has(target as SignalKind))),
      )
    : outcome.decisions;
  const selectedActions = resolveDecisions(
    resolvedDecisions,
    resolvedDecisions.length > 0 ? 'high' : 'low',
  ).flatMap((decision) => decision.selectedActions);

  return {
    ...outcome,
    signals: resolvedSignals,
    decisions: resolvedDecisions,
    planActions: mergeActions(selectedActions),
    conflictMatrix: resolveConflictMatrix(outcome.conflictMatrix, resolvedDecisions),
  };
};

const resolveConflictMatrix = (
  conflictMatrix: readonly ActionConflict[],
  decisions: readonly AdaptiveDecision[],
): readonly ActionConflict[] => {
  const active = new Set(
    decisions.flatMap((decision) => decision.selectedActions.map((action) => (action.targets[0] as string) ?? 'global')),
  );
  return conflictMatrix.filter((entry) => active.has(entry.serviceId));
};

export const describeWorkflow = (outcome: WorkflowOutcome): string[] => {
  const buckets = bucketByService(outcome.signals);
  const summary = buckets.map((bucket) => ({
    serviceId: bucket.serviceId,
    averageLoad: summarizeBucketLoad(bucket),
  }));
  const conflictCount = outcome.conflictMatrix.length;
  const criticalCount = extractCriticalDecisions(outcome.decisions).length;

  const descriptions = [
    `tenant=${outcome.tenantId}`,
    `coverage=${outcome.coverageRatio.toFixed(2)}`,
    `signals=${outcome.signals.length}`,
    `decisions=${outcome.decisions.length}`,
    `conflicts=${conflictCount}`,
    `critical=${criticalCount}`,
  ];

  const topBuckets = summary
    .filter((entry) => entry.averageLoad > 0)
    .sort((left, right) => right.averageLoad - left.averageLoad)
    .slice(0, 3)
    .map((bucket) => `${bucket.serviceId}:${bucket.averageLoad.toFixed(2)}`);

  return [...descriptions, ...topBuckets];
};

export const toDecisionCoverageMap = (decisions: readonly AdaptiveDecision[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    const key = decision.risk;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

export const assertPolicyIds = (
  policies: readonly AdaptivePolicy[],
): readonly AdaptivePolicy[] => {
  return policies.filter(nonEmpty).filter((policy) => `${policy.id}`.length > 0 && `${policy.tenantId}`.length > 0);
};
