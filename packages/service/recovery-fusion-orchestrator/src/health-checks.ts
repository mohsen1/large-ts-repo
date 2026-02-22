import type { FusionPlanResult, FusionBundle } from '@domain/recovery-fusion-intelligence';
import { evaluateSLO } from '@domain/recovery-fusion-intelligence';
import { buildBundleSnapshot, emitTelemetry } from '@domain/recovery-fusion-intelligence';
import type { FusionCycleResult, FusionMetrics } from './types';
import { ok, fail, type Result } from '@shared/result';
import { planResourceAllocation } from '@domain/recovery-fusion-intelligence';

export interface HealthDimension {
  readonly name: string;
  readonly status: 'ok' | 'warning' | 'critical';
  readonly score: number;
  readonly details: string;
}

export interface HealthReport {
  readonly runId: string;
  readonly bundleId: string;
  readonly dimensions: readonly HealthDimension[];
  readonly overall: 'ok' | 'degraded' | 'critical';
  readonly emitted: string;
}

const toDimension = (name: string, score: number, threshold: number): HealthDimension => ({
  name,
  status: score < threshold * 0.5 ? 'critical' : score < threshold ? 'warning' : 'ok',
  score,
  details: `${name}=${score.toFixed(3)} threshold=${threshold}`,
});

const scoreReadiness = (planResult: FusionPlanResult): number => {
  const risk = planResult.riskBand === 'green' ? 0.95 : planResult.riskBand === 'amber' ? 0.7 : 0.35;
  return Math.min(1, planResult.waveCount === 0 ? 0 : risk);
};

export const assessHealth = (
  bundle: FusionBundle,
  planResult: FusionPlanResult,
  metrics: FusionMetrics,
): Result<HealthReport, string> => {
  const resource = planResourceAllocation(bundle);
  const bundleSnapshot = buildBundleSnapshot(bundle, planResult);
  const slo = evaluateSLO(bundle, []);
  const dimensions: HealthDimension[] = [
    toDimension('latencyP50', 1 - metrics.latencyP50 / 1000, 0.95),
    toDimension('latencyP90', 1 - metrics.latencyP90 / 1000, 0.9),
    toDimension('command-pressure', metrics.commandCount / Math.max(1, resource.totalAvailable), 0.8),
    toDimension('readiness', scoreReadiness(planResult), 0.75),
    toDimension('slo', slo.score, 0.6),
  ];

  const criticalCount = dimensions.filter((entry) => entry.status === 'critical').length;
  const warningCount = dimensions.filter((entry) => entry.status === 'warning').length;
  const overall: HealthReport['overall'] = criticalCount > 0 ? 'critical' : warningCount > 1 ? 'degraded' : 'ok';

  return ok({
    runId: String(bundle.runId),
    bundleId: String(bundle.id),
    dimensions,
    overall,
    emitted: emitTelemetry(bundleSnapshot),
  });
};

export const assertHealthy = (report: HealthReport): Result<boolean, string> => {
  if (report.overall === 'critical') {
    return fail('health-critical');
  }
  return ok(true);
};
