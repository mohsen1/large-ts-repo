import { withBrand } from '@shared/core';
import type {
  RunAssessment,
  SignalDensityBucket,
  SignalIntensity,
  RunAssessmentSummary,
  RecoveryRiskSignal,
  CohortSignalAggregate,
  BatchReadinessAssessment,
  IntelligenceRunId,
} from './types';
import { parseRunAssessment } from './schemas';
import type { RecoverySignal } from '@domain/recovery-operations-models';

const BUCKET_BREAKPOINTS: [number, SignalDensityBucket][] = [
  [2, 'low'],
  [4, 'medium'],
  [7, 'high'],
  [10, 'critical'],
];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const densityForSignals = (signals: readonly RecoverySignal[]): number => {
  if (!signals.length) {
    return 0;
  }

  const averageSeverity = signals.reduce((sum, signal) => sum + signal.severity, 0) / signals.length;
  const weightedConfidence = signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length;
  const normalized = averageSeverity / 10;
  return clamp((normalized + weightedConfidence) / 2);
};

const bucketForDensity = (density: number): SignalDensityBucket => {
  if (!Number.isFinite(density)) {
    return 'low';
  }

  return BUCKET_BREAKPOINTS.find((entry) => density <= entry[0] / 10)?.[1] ?? 'critical';
};

const buildRecommendations = (runId: IntelligenceRunId, score: number, density: SignalDensityBucket): readonly string[] => {
  const recommendations: string[] = [
    `run:${String(runId)}`,
    `score:${score.toFixed(2)}`,
    `density:${density}`,
  ];

  if (score >= 8) {
    recommendations.push('throttle-operators', 'run-advisory');
  }

  if (density === 'high' || density === 'critical') {
    recommendations.push('raise-capacity', 'escalate-on-call');
  }

  if (score < 4) {
    recommendations.push('fast-recovery-path', 'disable-manual-approval');
  }

  return recommendations;
};

const summarizeIntensity = (signals: readonly RecoverySignal[]): SignalIntensity => {
  const averageSeverity = signals.reduce((sum, signal) => sum + signal.severity, 0);
  const sampleCount = Math.max(1, signals.length);
  const avg = averageSeverity / sampleCount;
  const bucket = bucketForDensity(avg / 10);

  return {
    bucket,
    averageSeverity: Number(avg.toFixed(2)),
    signalCount: signals.length,
  };
};

export const assessSignals = (
  runId: IntelligenceRunId,
  tenant: string,
  signals: readonly RecoverySignal[],
  score: number,
  planSummary: NonNullable<RunAssessmentSummary['planSummary']>,
): RunAssessment => {
  const density = densityForSignals(signals);
  const bucket = bucketForDensity(density);
  const intensity = summarizeIntensity(signals);

  return {
    runId,
    tenant,
    riskScore: Number((score * (1 + density)).toFixed(2)),
    confidence: Number((1 - density * 0.15).toFixed(4)),
    bucket,
    intensity,
    constraints: {
      maxParallelism: Math.max(1, Math.floor(planSummary.signalBudget.maxRetries * 0.5 + 1)),
      maxRetries: planSummary.signalBudget.maxRetries,
      timeoutMinutes: planSummary.signalBudget.timeoutMinutes,
      operatorApprovalRequired: score >= 6,
    },
    recommendedActions: buildRecommendations(runId, score, bucket),
    plan: {
      id: withBrand(`${tenant}-baseline`, 'RunPlanId'),
      name: `Signal-aware plan for ${tenant}`,
      program: {
        id: withBrand(`${tenant}-program`, 'RecoveryProgramId'),
        tenant: withBrand(tenant, 'TenantId'),
        service: withBrand(`${tenant}-service`, 'ServiceId'),
        name: 'Synthetic recovery program',
        description: 'Automated recovery readiness recovery program',
        priority: 'silver',
        mode: 'defensive',
        window: {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          timezone: 'UTC',
        },
        topology: {
          rootServices: ['core'],
          fallbackServices: [],
          immutableDependencies: [],
        },
        constraints: [],
        steps: [
          {
            id: `${tenant}-assess`,
            title: 'Assess',
            command: 'assess',
            timeoutMs: 30_000,
            dependencies: [],
            requiredApprovals: 0,
            tags: ['automation'],
          },
          {
            id: `${tenant}-patch`,
            title: 'Patch',
            command: 'patch',
            timeoutMs: 60_000,
            dependencies: [`${tenant}-assess`],
            requiredApprovals: 0,
            tags: ['automation'],
          },
        ],
        owner: tenant,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ['synth'],
      },
      constraints: {
        maxParallelism: Math.max(1, Math.floor(planSummary.signalBudget.maxRetries * 0.8)),
        maxRetries: planSummary.signalBudget.maxRetries,
        timeoutMinutes: planSummary.signalBudget.timeoutMinutes,
        operatorApprovalRequired: bucket === 'critical',
      },
      fingerprint: {
        tenant: withBrand(tenant, 'TenantId'),
        region: 'us-east-1',
        serviceFamily: 'incident-response',
        impactClass: 'infrastructure',
        estimatedRecoveryMinutes: 12,
      },
      sourceSessionId: undefined,
      effectiveAt: new Date().toISOString(),
    },
  };
};

export const parseAndNormalizeAssessment = (value: unknown): RunAssessment => parseRunAssessment(value);

export const aggregateByTenantAndRun = (
  signals: readonly RecoveryRiskSignal[],
): readonly CohortSignalAggregate[] => {
  const byTenant = new Map<string, CohortSignalAggregate & { runId: IntelligenceRunId }>();

  for (const signal of signals) {
    const key = `${signal.window.tenant}::${signal.runId}`;
    const aggregate = byTenant.get(key);
    const source = signal.source as CohortSignalAggregate['distinctSources'][number];
    const next: CohortSignalAggregate = aggregate
      ? {
          tenant: signal.window.tenant,
          runId: signal.runId,
          count: aggregate.count + 1,
          maxConfidence: Math.max(aggregate.maxConfidence, signal.signal.confidence),
          distinctSources: Array.from(new Set([...aggregate.distinctSources, source])),
        }
      : {
          tenant: signal.window.tenant,
          runId: signal.runId,
          count: 1,
          maxConfidence: signal.signal.confidence,
          distinctSources: [source],
        };

    byTenant.set(key, next);
  }

  return Array.from(byTenant.values());
};

export const buildBatchAssessment = (cohorts: readonly CohortSignalAggregate[]): BatchReadinessAssessment => {
  const red = cohorts.filter((entry) => entry.count > 8).reduce((sum, entry) => sum + entry.maxConfidence, 0);
  const overallRisk = red > 5 ? 'red' : cohorts.some((entry) => entry.count > 4) ? 'amber' : 'green';

  return {
    cohort: cohorts,
    generatedAt: new Date().toISOString(),
    overallRisk,
  };
};
