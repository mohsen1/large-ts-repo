import type { ReadinessReadModel, StoreSnapshot } from './models';
import type { ReadinessRunId, ReadinessDirective, ReadinessSignal } from '@domain/recovery-readiness';
import { envelopeToReadinessSignalEnvelope, evaluateRiskEnvelope } from '@domain/recovery-readiness';
import { auditReadinessPlan } from '@domain/recovery-readiness';
import { mapImpactSignals } from '@domain/recovery-readiness'
export interface RiskSnapshot {
  readonly runId: ReadinessRunId;
  readonly risk: number;
  readonly envelopes: readonly ReturnType<typeof envelopeToReadinessSignalEnvelope>[];
  readonly directiveCount: number;
  readonly auditStatus: 'pass' | 'warn' | 'fail';
}

export interface SnapshotRollup {
  readonly totalRuns: number;
  readonly avgRisk: number;
  readonly topRun: ReadinessRunId | undefined;
  readonly warnings: number;
}

export function computeRiskSnapshot(model: ReadinessReadModel): RiskSnapshot {
  const risk = evaluateRiskEnvelope(model.signals);
  const envelopes = model.signals.map((signal, index) => envelopeToReadinessSignalEnvelope(signal, index));
  const directives = model.directives as unknown as ReadinessDirective[];

  const audit = auditReadinessPlan({
    plan: model.plan,
    directives,
    signals: model.signals as unknown as ReadinessSignal[],
    policy: {
      policyId: 'policy:default',
      name: 'default',
      constraints: {
        key: 'constraints:default',
        minWindowMinutes: 10,
        maxWindowMinutes: 120,
        minTargetCoveragePct: 0.2,
        forbidParallelity: false,
      },
      allowedRegions: new Set(model.plan.targets.map((target) => target.region)),
      blockedSignalSources: [],
    },
  });

  return {
    runId: model.plan.runId,
    risk: risk.totalScore,
    envelopes,
    directiveCount: directives.length,
    auditStatus: audit.status,
  };
}

export function snapshotStore(models: readonly ReadinessReadModel[]): {
  readonly rollup: SnapshotRollup;
  readonly signals: readonly string[];
  readonly snapshot: StoreSnapshot;
} {
  const scores = models.map((model) => computeRiskSnapshot(model));
  const ranked = [...scores].sort((left, right) => right.risk - left.risk);

  const avgRisk = ranked.length === 0 ? 0 : Number((ranked.reduce((sum, item) => sum + item.risk, 0) / ranked.length).toFixed(2));
  const warnings = ranked.filter((entry) => entry.auditStatus === 'warn').length;
  const topRun = ranked[0]?.runId;
  const signals: string[] = ranked.map((entry) => `${entry.runId}:${entry.risk}`);

  return {
    rollup: {
      totalRuns: models.length,
      avgRisk,
      topRun,
      warnings,
    },
    signals,
    snapshot: {
      createdRuns: scores.length,
      updatedRuns: scores.length,
      failedWrites: warnings,
      totalSignals: models.reduce((sum, model) => sum + model.signals.length, 0),
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

export function snapshotBySignals(models: readonly ReadinessReadModel[]): Record<string, number> {
  return models.reduce<Record<string, number>>((acc, model) => {
    const impact = mapImpactSignals(model.signals, model.directives as unknown as ReadinessDirective[]);
    const peak = impact.cells.reduce((max, cell) => Math.max(max, cell.forecastPeak), 0);
    acc[model.plan.runId] = peak + impact.summary.signalVolume;
    return acc;
  }, {});
}
