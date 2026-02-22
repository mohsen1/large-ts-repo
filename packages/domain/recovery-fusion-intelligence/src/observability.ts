import type { FusionBundle, FusionPlanResult, FusionEvaluation } from './types';

export interface FusionMetric {
  readonly name: string;
  readonly value: number;
  readonly tags: Record<string, string>;
  readonly observedAt: string;
}

export interface FusionTelemetrySnapshot {
  readonly runId: string;
  readonly bundleId: string;
  readonly waveCount: number;
  readonly decisionAccepted: boolean;
  readonly riskBand: string;
  readonly metrics: readonly FusionMetric[];
}

const buildMetric = (name: string, value: number, tags: Record<string, string>): FusionMetric => ({
  name,
  value,
  tags,
  observedAt: new Date().toISOString(),
});

const addTag = (value: string | undefined, fallback: string): string => value ?? fallback;

export const buildBundleSnapshot = (bundle: FusionBundle, result: FusionPlanResult): FusionTelemetrySnapshot => {
  const waveCount = bundle.waves.length;
  const acceptedMetric = buildMetric('fusion.accepted', result.accepted ? 1 : 0, {
    tenant: addTag(bundle.tenant, 'unknown'),
    riskBand: result.riskBand,
    planId: String(bundle.planId),
  });
  const waveMetric = buildMetric('fusion.waves', waveCount, {
    planId: String(bundle.planId),
    runId: String(bundle.runId),
    state: bundle.waves[0]?.state ?? 'idle',
  });

  const signalMetric = buildMetric('fusion.signals', bundle.signals.length, {
    tenant: addTag(bundle.tenant, 'unknown'),
    session: String(bundle.session.id),
  });

  return {
    runId: String(bundle.runId),
    bundleId: bundle.id,
    waveCount,
    decisionAccepted: result.accepted,
    riskBand: result.riskBand,
    metrics: [acceptedMetric, waveMetric, signalMetric],
  };
};

export const summarizeEvaluation = (evaluations: readonly FusionEvaluation[]): string[] => {
  if (evaluations.length === 0) {
    return ['no-evaluations'];
  }

  const top = [...evaluations]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((evaluation) => `${evaluation.bundleId}:${evaluation.score.toFixed(2)}:${evaluation.recommended.length}`);

  return top;
};

export const emitTelemetry = (snapshot: FusionTelemetrySnapshot): string =>
  JSON.stringify({
    source: 'recovery-fusion-intelligence',
    observedAt: new Date().toISOString(),
    snapshot,
  });

export const metricLines = (snapshot: FusionTelemetrySnapshot): readonly string[] =>
  snapshot.metrics.map((metric) => `${metric.name} ${metric.value} ${JSON.stringify(metric.tags)}`);
