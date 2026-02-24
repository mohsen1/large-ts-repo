import {
  type ReadinessSignal,
  type ReadinessRunId,
  type ReadinessSignalEnvelope,
  type ReadinessConstraintSet,
  type ReadinessSloProfile,
  type ReadinessForecast,
  type ReadinessPolicyViolation,
  type ReadinessPolicyEnvelope,
  type ReadinessReadModelEnvelope,
} from '@domain/recovery-readiness';
import type { ReadinessRunbook } from '@domain/recovery-readiness';

export type CadenceSignalInput = Readonly<{
  runId: ReadinessRunId;
  signals: ReadonlyArray<ReadinessSignal>;
  constraints: ReadonlyArray<ReadinessConstraintSet>;
}>;

export type CadenceReadinessSummary = Readonly<{
  runId: ReadinessRunId;
  severityCounts: ReadonlyMap<ReadinessSignal['severity'], number>;
  uniqueTargets: number;
  sourceMap: ReadonlyMap<ReadinessSignal['source'], number>;
  criticalityWeight: number;
  denseSignals: ReadonlyArray<ReadinessSignal>;
}>;

export type CadencePolicyTrace = Readonly<{
  runId: ReadinessRunId;
  constraintSet: ReadinessConstraintSet;
  policy: ReadinessPolicyEnvelope;
  violations: ReadonlyArray<ReadinessPolicyViolation>;
  readModel: ReadinessReadModelEnvelope;
}>;

export type CadenceForecastEnvelope = Readonly<{
  runId: ReadinessRunId;
  horizonMinutes: number;
  forecast: ReadinessForecast;
  confidence: number;
}>;

export type CadenceReadModelSignal = {
  readonly signal: ReadinessSignal;
  readonly envelope: ReadinessSignalEnvelope<Record<string, unknown>>;
  readonly enrichedTags: readonly string[];
};

export type CadenceReadbookArtifact = Readonly<{
  runbook: ReadinessRunbook;
  runId: ReadinessRunId;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionCount: number;
  tags: readonly string[];
}>;

const classifySourceWeight = (source: ReadinessSignal['source']): number => {
  if (source === 'telemetry') return 1;
  if (source === 'manual-check') return 1.5;
  return 1.2;
};

const severityWeight = (severity: ReadinessSignal['severity']): number => {
  if (severity === 'critical') return 4;
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
};

const averageSignalsPerTarget = (signals: ReadonlyArray<ReadinessSignal>): number => {
  const buckets = new Map<string, number>();
  for (const signal of signals) {
    const key = String(signal.targetId);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  if (buckets.size === 0) return 0;
  const total = signals.length;
  return total / buckets.size;
};

export const summarizeCadenceSignals = (input: CadenceSignalInput): CadenceReadinessSummary => {
  const severityCounts = new Map<ReadinessSignal['severity'], number>();
  const sourceMap = new Map<ReadinessSignal['source'], number>();

  for (const signal of input.signals) {
    severityCounts.set(signal.severity, (severityCounts.get(signal.severity) ?? 0) + 1);
    sourceMap.set(signal.source, (sourceMap.get(signal.source) ?? 0) + 1);
  }

  const uniqueTargets = new Set(input.signals.map((signal) => String(signal.targetId))).size;
  const criticalityWeight =
    input.signals.reduce(
      (acc, signal) => acc + severityWeight(signal.severity) * classifySourceWeight(signal.source),
      0,
    ) + sourceMap.size + averageSignalsPerTarget(input.signals);

  const densityThreshold = Math.max(1, input.constraints.reduce((acc, constraint) => acc + (constraint.maxSignalsPerMinute ?? 0), 0));
  const denseSignals = input.signals.filter((signal) => (sourceMap.get(signal.source) ?? 0) >= densityThreshold);

  return {
    runId: input.runId,
    severityCounts,
    uniqueTargets,
    sourceMap,
    criticalityWeight,
    denseSignals,
  };
};

export const buildSignalEnvelope = (
  signal: ReadinessSignal,
  runId: ReadinessRunId,
  payload: Record<string, unknown>,
): CadenceReadModelSignal => ({
  signal,
  envelope: {
    signal,
    envelope: {
      ...payload,
      policyRunId: runId,
      observedAt: new Date().toISOString(),
    },
    weight: Math.max(1, severityWeight(signal.severity) * classifySourceWeight(signal.source)),
  },
  enrichedTags: [
    `run:${runId}`,
    `severity:${signal.severity}`,
    `source:${signal.source}`,
    `target:${signal.targetId}`,
  ],
});

export const rankSloCoverage = (profiles: readonly ReadinessSloProfile[]): ReadonlyMap<string, number> => {
  const rank = new Map<string, number>();
  for (const profile of profiles) {
    const score = profile.targets.reduce((acc, target) => acc + target.warningAt + target.criticalAt, 0) / Math.max(1, profile.targets.length);
    rank.set(profile.profileId, Number(score.toFixed(2)));
  }
  return rank;
};

export const buildPolicyTrace = (
  runId: ReadinessRunId,
  constraintSet: ReadinessConstraintSet,
  violations: readonly ReadinessPolicyViolation[],
): CadencePolicyTrace => ({
  runId,
  constraintSet,
  policy: {
    policyId: `${runId}-policy`,
    policyName: 'cadence-readiness-policy',
    mode: constraintSet.maxSignalsPerMinute && constraintSet.maxSignalsPerMinute > 500 ? 'emergency' : 'enforced',
    constraints: {
      policyId: `policy-${runId}`,
      maxSignalsPerMinute: constraintSet.maxSignalsPerMinute,
      minimumActiveTargets: constraintSet.minimumActiveTargets,
      maxDirectiveRetries: constraintSet.maxDirectiveRetries,
      blackoutWindows: constraintSet.blackoutWindows,
    },
    allowedRegions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
    blockedSignalSources: ['telemetry'],
  },
  violations: violations,
  readModel: {
    runId,
    payload: {
      policyRunId: runId,
      policyName: 'cadence-readiness-policy',
      acceptedViolations: Math.max(0, violations.length - 1),
      lastUpdated: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    revision: 1,
    tags: ['cadence', 'policy'],
  },
});

export const buildForecastEnvelope = (forecast: ReadinessForecast): CadenceForecastEnvelope => {
  const confidence = forecast.confidence * 100;
  return {
    runId: forecast.runId,
    horizonMinutes: forecast.horizonMinutes,
    forecast,
    confidence,
  };
};

export const buildReadbookArtifact = (
  runbook: ReadinessRunbook,
  runId: ReadinessRunId,
  tags: readonly string[],
): CadenceReadModelSignal[] => {
  const actions = Object.entries(runbook.state).slice(0, 6);
  const artifact: CadenceReadbookArtifact = {
    runbook,
    runId,
    priority: runbook.strategy === 'aggressive' ? 'critical' : 'medium',
    actionCount: actions.length,
    tags,
  };

  const baseline: CadenceReadModelSignal[] = [];
  for (const entry of actions) {
    const signal: ReadinessSignal = {
      signalId: `${runId}:${entry[0]}` as ReadinessSignal['signalId'],
      runId,
      targetId: `${runId}-target` as ReadinessSignal['targetId'],
      source: 'synthetic',
      name: `runbook-${entry[0]}`,
      severity: entry[1] ? 'medium' : 'low',
      capturedAt: new Date().toISOString(),
      details: {
        action: entry[0],
        value: entry[1],
        artifactPriority: artifact.priority,
        artifactTags: artifact.tags,
      },
    };

    baseline.push(buildSignalEnvelope(signal, runId, {
      strategy: artifact.priority,
      action: entry[0],
      value: entry[1],
    }));
  }

  return baseline;
};
