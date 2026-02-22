import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import type { RecoveryRiskSignal, RunAssessment, CohortSignalAggregate } from '@domain/recovery-operations-intelligence';
import {
  analyzeSignalHistory,
  trendRecommendations,
  buildSignalTimeline,
  type SignalTimeline,
} from '@domain/recovery-operations-intelligence';
import {
  estimateRetentionImpact,
  buildRetentionSnapshot,
  validateRetentionInput,
  DefaultRetentionPolicyFactory,
  type RetentionOutcome,
} from '@data/recovery-operations-intelligence-store';
import {
  buildProjectionSeries,
  buildProjectionFromSignals,
  type SignalProjectionRepository,
  InMemoryProjectionRepository,
  validateProjection,
} from '@data/recovery-operations-intelligence-store';
import type { SignalRecord, IntelligenceSnapshot, IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import { withBrand } from '@shared/core';

export interface WatchdogInput {
  readonly tenant: string;
  readonly runId: string;
  readonly signals: readonly RecoveryRiskSignal[];
  readonly assessments: readonly RunAssessment[];
  readonly snapshots: readonly IntelligenceSnapshot[];
  readonly signalRecords: readonly SignalRecord[];
  readonly repository: {
    loadAggregate(input: { tenant: string; runId: string; windowHours: number; minConfidence: number }): Promise<unknown>;
    intRepository: IntelligenceRepository;
  };
}

export interface WatchdogSnapshot {
  readonly tenant: string;
  readonly runId: string;
  readonly timeline: SignalTimeline;
  readonly recommendations: readonly string[];
  readonly projections: readonly string[];
  readonly retention: RetentionOutcome;
}

export interface WatchdogOutput {
  readonly tenant: string;
  readonly runId: string;
  readonly status: 'ok' | 'warning' | 'critical';
  readonly details: WatchdogSnapshot;
}

type PolicyScope = 'observe' | 'escalate' | 'contain' | 'rollback';

interface Rule {
  readonly scope: PolicyScope;
  readonly message: string;
  readonly threshold: number;
}

const defaultRules: readonly Rule[] = [
  { scope: 'observe', message: 'confidence drift', threshold: 0.3 },
  { scope: 'escalate', message: 'rapid signal growth', threshold: 2.2 },
  { scope: 'contain', message: 'high criticality trend', threshold: 0.4 },
  { scope: 'rollback', message: 'aggregate spike', threshold: 12 },
];

const toCohortBuckets = (signals: readonly RecoveryRiskSignal[]): readonly CohortSignalAggregate[] => {
  const counts = new Map<string, CohortSignalAggregate>();
  for (const signal of signals) {
    const key = `${signal.window.tenant}::${signal.runId}`;
    const current = counts.get(key);
    const next = current
      ? {
          tenant: current.tenant,
          runId: current.runId,
          count: current.count + 1,
          maxConfidence: Math.max(current.maxConfidence, signal.signal.confidence),
          distinctSources: Array.from(new Set([...current.distinctSources, signal.source])),
        }
      : {
          tenant: signal.window.tenant,
          runId: signal.runId,
          count: 1,
          maxConfidence: signal.signal.confidence,
          distinctSources: [signal.source],
        };
    counts.set(key, next);
  }
  return [...counts.values()];
};

const evaluateRules = (
  analysis: ReturnType<typeof analyzeSignalHistory>,
  recommendations: readonly string[],
  cohorts: readonly CohortSignalAggregate[],
): WatchdogOutput['status'] => {
  const buckets = cohorts;
  const cohortCount = buckets.length;
  const critical = recommendations.includes('open-incident-channel') ? 1 : 0;
  const score = analysis.severityDelta + analysis.confidenceDelta + cohortCount * 0.1 + critical;
  if (score > defaultRules[1]!.threshold) {
    return 'critical';
  }
  if (score > defaultRules[2]!.threshold) {
    return 'warning';
  }
  return 'ok';
};

const buildRetention = (
  tenant: string,
  signals: readonly SignalRecord[],
): Result<RetentionOutcome, string> => {
  const factory = new DefaultRetentionPolicyFactory({
    tenant: withBrand(tenant, 'TenantId'),
    keepHours: 6,
    maxEntries: 100,
    allowNoisySignalTypes: ['telemetry', 'queue', 'policy'],
  });

  const policy = factory.create(withBrand(tenant, 'TenantId'));
  const validated = validateRetentionInput(policy);
  if (!validated.ok) {
    return fail(validated.error);
  }

  const retained = signals.filter((signal) => signal.signalId && signal.signalId.length > 0);
  return ok(estimateRetentionImpact(policy, [], retained, []));
};

const buildProjections = async (signals: readonly RecoveryRiskSignal[]): Promise<readonly string[]> => {
  const repo: SignalProjectionRepository = new InMemoryProjectionRepository();
  const latestByTenant = new Map<string, ReturnType<typeof buildProjectionFromSignals>>();
  const tenantSignals = new Map<string, RecoveryRiskSignal[]>();
  for (const signal of signals) {
    const next = tenantSignals.get(signal.window.tenant) ?? [];
    next.push(signal);
    tenantSignals.set(signal.window.tenant, next);
  }
  const projections: string[] = [];

  for (const [tenant, values] of tenantSignals) {
    const records = values.map((entry) => ({
      tenant: withBrand(tenant, 'TenantId'),
      runId: String(entry.runId),
      signalId: entry.envelopeId,
      signal: entry.signal,
      score: entry.signal.severity / 10,
      consumedAt: entry.window.to,
    }));
    const projection = buildProjectionFromSignals({
      tenant,
      runId: values[0]?.runId ? String(values[0].runId) : 'unknown',
      signals: records,
    });
    const validated = validateProjection(projection);
    if (!validated.ok) {
      continue;
    }
    await repo.saveProjection(validated.value);
    const latest = await repo.loadLatest(tenant, projection.runId);
    if (latest) {
      const summary = buildProjectionSeries([latest]);
      projections.push(summary.snapshots[0] ? `${tenant}:${summary.status}:${summary.snapshots.length}` : `${tenant}:none`);
      latestByTenant.set(tenant, latest);
    }
  }

  return projections;
}

export const monitorRunSignals = async (input: WatchdogInput): Promise<Result<WatchdogOutput, string>> => {
  const timeline = buildSignalTimeline(input.tenant, input.signals, 'backwards');
  const cohorts = toCohortBuckets(input.signals);
  const analysis = analyzeSignalHistory(input.tenant, input.signals, input.assessments);
  const recommendations = trendRecommendations(analysis);
  const retention = buildRetention(input.tenant, input.signalRecords);
  if (!retention.ok) {
    return fail(retention.error);
  }

  const projections = await buildProjections(input.signals);
  const status = evaluateRules(analysis, recommendations, cohorts);
  const baseline = [
    `timeline:${timeline.timelineId}`,
    `signals:${input.signals.length}`,
    `cohorts:${cohorts.length}`,
    `trend:${analysis.trend}`,
  ];

  return ok({
    tenant: input.tenant,
    runId: input.runId,
    status,
    details: {
      tenant: input.tenant,
      runId: input.runId,
      timeline,
      recommendations: [...baseline, ...recommendations],
      projections,
      retention: retention.value,
    },
  });
};
