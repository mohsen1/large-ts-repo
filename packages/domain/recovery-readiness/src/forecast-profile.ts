import type { ReadinessDirective, ReadinessRunId, ReadinessSignal, ReadinessTarget, RecoveryReadinessPlan, ReadinessSignalEnvelope } from './types';
import { weightedRiskDensity, buildSignalMatrix } from './signal-matrix';
import { foldSignals } from './signals';
import { projectSignals } from './forecast';
import type { ReadinessPolicy as PolicyConfig } from './policy';
import { targetCriticalityScoreFallback } from './policy';

export interface ForecastBucket {
  runId: ReadinessRunId;
  timestamp: string;
  signalDensity: number;
  projected: number;
  confidence: number;
  riskBand: ReturnType<typeof foldSignals>['riskBand'];
}

export interface ForecastProfile {
  runId: ReadinessRunId;
  source: ReadinessRunId;
  forecastHorizonMinutes: number;
  windows: readonly ForecastBucket[];
  summary: {
    totalProjected: number;
    averageProjection: number;
    volatility: number;
    maxDensity: number;
  };
}

export interface ProfileEnvelope<TPayload = Record<string, unknown>> {
  runId: ReadinessRunId;
  payload: TPayload;
  createdAt: string;
  revision: number;
  tags: readonly string[];
}

export interface Anomaly {
  runId: ReadinessRunId;
  at: string;
  signalId: ReadinessSignal['signalId'];
  expectedRange: [number, number];
  observed: number;
  severity: number;
}

interface RunPayload {
  runId: ReadinessRunId;
  signals: readonly ReadinessSignal[];
  targets: readonly ReadinessTarget[];
  directives: readonly ReadinessDirective[];
  plan: {
    planId: RecoveryReadinessPlan['planId'];
    runId: ReadinessRunId;
    riskBand: RecoveryReadinessPlan['riskBand'];
    targets: readonly ReadinessTarget[];
    windows: RecoveryReadinessPlan['windows'];
    signals: readonly ReadinessSignal[];
    metadata: {
      owner: string;
      tags: readonly string[];
    };
  };
  revision: number;
  updatedAt: string;
}

export function profileForRun(input: { runId: ReadinessRunId; model: RunPayload }): ForecastProfile {
  const density = weightedRiskDensity(input.model.signals);
  const projected = projectSignals(input.runId, input.model.signals, {
    baseSignalDensity: density * 10,
    volatilityWindowMinutes: Math.max(15, input.model.signals.length * 2),
  });

  const windows = projected.forecast.projectedSignals.map((point, index) => ({
    runId: input.runId,
    timestamp: point.ts,
    signalDensity: Number(density.toFixed(2)),
    projected: Number(point.value.toFixed(2)),
    confidence: projected.forecast.confidence,
    riskBand: input.model.plan.riskBand,
  }));

  const totalProjected = windows.reduce((sum, window) => sum + window.projected, 0);

  return {
    runId: input.runId,
    source: input.runId,
    forecastHorizonMinutes: projected.forecast.horizonMinutes,
    windows,
    summary: {
      totalProjected: Number(totalProjected.toFixed(2)),
      averageProjection: windows.length > 0 ? Number((totalProjected / windows.length).toFixed(2)) : 0,
      volatility: Number((projected.confidenceBand.high - projected.confidenceBand.low).toFixed(3)),
      maxDensity: weightedRiskDensity(input.model.signals),
    },
  };
}

export function buildReadinessEnvelope(input: {
  model: RunPayload;
  profile: ForecastProfile;
  tags?: readonly string[];
}): ProfileEnvelope<{ profile: ForecastProfile; modelId: string }> {
  return {
    runId: input.model.plan.runId,
    payload: {
      profile: input.profile,
      modelId: input.model.plan.planId,
    },
    createdAt: new Date().toISOString(),
    revision: input.model.revision,
    tags: [...(input.tags ?? []), 'forecast'],
  };
}

export function pickTopSignals(signals: readonly ReadinessSignal[], limit = 5): readonly ReadinessSignalEnvelope[] {
  const indexed = [...signals].map((signal, index) => ({
    signal,
    envelope: {
      signalCount: signals.length,
      index,
    },
    weight: signal.signalId.length + 1,
  }));

  return indexed
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit)
    .map((entry) => {
      const ageMinutes = String(indexAgeMinutes(entry.signal.capturedAt));
      return {
        signal: entry.signal,
        envelope: {
          signalId: entry.signal.signalId,
          runId: entry.signal.runId,
          source: entry.signal.source,
          context: {
            target: entry.signal.targetId,
            ageMinutes,
          },
          weight: entry.weight,
        },
        weight: entry.weight,
      } as ReadinessSignalEnvelope<Record<string, unknown>>;
    });
}

export function detectAnomalies(input: {
  policy: PolicyConfig;
  model: RunPayload;
}): readonly Anomaly[] {
  const summary = foldSignals(input.model.signals);
  const profile = profileForRun({ runId: input.model.plan.runId, model: input.model });
  const criticalityByTarget = new Map<ReadinessTarget['id'], number>();

  for (const target of input.model.targets) {
    criticalityByTarget.set(target.id, targetCriticalityScoreFallback(target));
  }

  const matrix = buildSignalMatrix(input.model.signals);
  return input.model.signals.flatMap((signal, index) => {
    const expected = profile.summary.averageProjection * 0.5;
    const observed = matrix.totalSignals / Math.max(1, input.model.signals.length) * (index + 1);
    if (summary.riskBand !== 'green' && observed > expected && input.policy.constraints.forbidParallelity) {
      return [
        {
          runId: input.model.plan.runId,
          at: signal.capturedAt,
          signalId: signal.signalId,
          expectedRange: [0, expected],
          observed,
          severity: Math.min(10, (criticalityByTarget.get(signal.targetId) ?? 1) / 10),
        },
      ];
    }
    return [];
  });
}

export function aggregateReadinessSignalWindow(points: readonly { ts: string; value: number }[]): readonly { ts: string; value: number }[] {
  return points.map((point) => ({ ts: point.ts, value: point.value }));
}

function indexAgeMinutes(capturedAt: string): number {
  const parsed = Date.parse(capturedAt);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(((Date.now() - parsed) / 60000).toFixed(2));
}
