import type { ReadinessReadModel, StoreSnapshot, ReadinessWindowDigest } from './models';
import type { ReadinessSignal as DomainSignal, ReadinessTarget, RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { ReadinessDirective } from '@domain/recovery-readiness';
import { buildSignalMatrix, criticalityScoreByTarget, summarizeProfiles } from '@domain/recovery-readiness';
import { detectPolicyViolations, evaluateRiskEnvelope, type ReadinessRiskEnvelope } from '@domain/recovery-readiness'
export interface WindowHealth {
  readonly windowIndex: number;
  readonly runId: ReadinessWindowDigest['runId'];
  readonly healthScore: number;
  readonly bucketCount: number;
}

export interface SignalHealthDigest {
  readonly runId: ReadinessReadModel['plan']['runId'];
  readonly totalSignals: number;
  readonly topTarget: ReadinessTarget['id'] | undefined;
  readonly directiveReadiness: number;
  readonly policyAlerts: number;
  readonly windows: readonly WindowHealth[];
  readonly riskEnvelope: ReadinessRiskEnvelope;
}

export interface ReadinessStorePlanSnapshot {
  readonly runId: ReadinessReadModel['plan']['runId'];
  readonly riskBand: ReadinessReadModel['plan']['riskBand'];
  readonly topSignalId: DomainSignal['signalId'] | undefined;
  readonly windowDensity: number;
}

function toWindowHealth(digest: ReadinessWindowDigest, index: number, sourceSignals: readonly DomainSignal[]): WindowHealth {
  const density = sourceSignals.slice(index * 3, index * 3 + 3).length;
  const healthScore = Math.max(0, 100 - Math.min(80, digest.criticality * density));

  return {
    windowIndex: index,
    runId: digest.runId,
    healthScore,
    bucketCount: density,
  };
}

export function digestModelReadiness(model: ReadinessReadModel): SignalHealthDigest {
  const targets = model.plan.targets;
  const directives = model.directives as unknown as ReadinessDirective[];
  const windows = model.plan.windows as unknown as ReadinessWindowDigest[];

  const matrix = buildSignalMatrix(model.signals);
  const topTarget = [...criticalityScoreByTarget(model.signals).entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const riskEnvelope = evaluateRiskEnvelope(model.signals);
  const policyAlerts = model.plan.riskBand === 'red' ? 3 : model.plan.riskBand === 'amber' ? 1 : 0;
  const directiveReadiness = Math.min(100, directives.length * 4 + model.signals.length);

  const windowsHealth = windows.map((entry, index) => toWindowHealth(entry, index, model.signals));

  return {
    runId: model.plan.runId,
    totalSignals: model.signals.length,
    topTarget,
    directiveReadiness,
    policyAlerts,
    windows: windowsHealth,
    riskEnvelope,
  };
}

export function summarizeRunbookReadiness(models: readonly ReadinessReadModel[]): ReadonlyArray<ReadinessStorePlanSnapshot> {
  return models
    .map((model) => {
      const matrix = buildSignalMatrix(model.signals);
      return {
        runId: model.plan.runId,
        riskBand: model.plan.riskBand,
        topSignalId: model.signals[0]?.signalId,
        windowDensity: matrix.totalSignals > 0 ? matrix.cells.length / matrix.totalSignals : 0,
      };
    })
    .sort((left, right) => right.windowDensity - left.windowDensity);
}

export function mergeSignalsByProfile(models: readonly ReadinessReadModel[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();

  for (const model of models) {
    const profiles = summarizeProfiles(model.signals);
    for (const profile of profiles) {
      const next = map.get(profile.targetId) ?? 0;
      map.set(profile.targetId, next + (profile.delta < 0 ? -1 : 1));
    }
  }

  return map;
}

export function buildStoreSnapshotState(models: readonly ReadinessReadModel[], runCount = 0): StoreSnapshot {
  const totalSignals = models.reduce((sum, model) => sum + model.signals.length, 0);
  const failedWrites = models.some((model) => model.revision < 0) ? 1 : 0;

  return {
    createdRuns: runCount,
    updatedRuns: models.length,
    failedWrites,
    totalSignals,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function detectViolationsByPlan(policy: { policyName: string; blockedSignalSources: ReadonlyArray<string> }, model: ReadinessReadModel): ReadonlyArray<string> {
  const violations = detectPolicyViolations(
    {
      policyId: 'policy',
      policyName: policy.policyName,
      mode: 'advisory',
      constraints: {
        policyId: 'policy',
        maxSignalsPerMinute: 20,
        minimumActiveTargets: 1,
        maxDirectiveRetries: 4,
        blackoutWindows: [],
      },
      allowedRegions: model.plan.targets.map((target) => target.region),
      blockedSignalSources: [...policy.blockedSignalSources] as ReadinessReadModel['signals'][number]['source'][],
    },
    model.signals,
  );

  return violations.map((violation) => `${violation.reason}:${violation.location}`);
}
