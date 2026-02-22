import type {
  ReadinessSignal,
  ReadinessTarget,
  ReadinessForecast,
  ReadinessDirective,
  RecoveryReadinessPlan,
  ReadinessRunId,
} from './types';

import { projectSignals } from './forecast';
import { criticalityScoreByTarget } from './signal-matrix';

export interface IncidentImpactHeatCell {
  readonly targetId: ReadinessTarget['id'];
  readonly targetName: string;
  readonly projectedVolume: number;
  readonly forecastPeak: number;
  readonly directiveReadiness: number;
}

export interface IncidentImpactEnvelope {
  readonly runId: ReadinessRunId;
  readonly snapshotAt: string;
  readonly cells: readonly IncidentImpactHeatCell[];
  readonly summary: {
    readonly activeDirectives: number;
    readonly forecastConfidence: number;
    readonly signalVolume: number;
  };
}

interface HeatIndex {
  [targetId: string]: {
    readonly name: string;
    readonly volume: number;
    readonly peaks: number[];
    readonly directives: ReadinessDirective['directiveId'][];
  };
}

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 1;
}

function normalizeCellTarget(signal: ReadinessSignal, targetName?: string): ReadinessTarget['id'] {
  return signal.targetId ?? ((`target:${signal.runId}` as never) as ReadinessTarget['id']);
}

export function scoreDirectiveReadiness(plan: RecoveryReadinessPlan, directives: readonly ReadinessDirective[]): number {
  if (!plan.targets.length) {
    return 0;
  }

  const directiveCoverage = directives
    .flatMap((directive) => directive.dependsOn)
    .reduce<Record<string, number>>((acc, dependency) => {
      acc[dependency.directiveId] = (acc[dependency.directiveId] ?? 0) + 1;
      return acc;
    }, {});

  const denominator = Math.max(1, directives.length);
  const withCoverage = Object.values(directiveCoverage).reduce((sum, value) => sum + value, 0);
  return Number(((withCoverage / denominator) * 100).toFixed(1));
}

export function mapImpactSignals(signals: readonly ReadinessSignal[], directives: readonly ReadinessDirective[]): IncidentImpactEnvelope {
  const grouped = new Map<ReadinessTarget['id'], { name: string; volume: number; peaks: number[]; directives: string[] }>();

  for (const signal of signals) {
    const key = normalizeCellTarget(signal, asString(signal.details?.['targetName']));
    const existing = grouped.get(key);
    const payload = {
      name: asString(signal.details?.targetName) || asString(key),
      volume: (existing?.volume ?? 0) + 1,
      peaks: existing ? [...existing.peaks, asNumber(signal.details?.intensity)] : [asNumber(signal.details?.intensity)],
      directives: existing
        ? [...existing.directives, ...asStringArray(signal.details?.['directives'])]
        : [...asStringArray(signal.details?.['directives'])],
    };
    grouped.set(key, payload);
  }

  const criticality = criticalityScoreByTarget(signals);

  const cells: IncidentImpactHeatCell[] = Array.from(grouped.entries()).map(([targetId, info]) => {
    const volume = Math.max(0, info.volume);
    const projected = projectSignals(signals[0]?.runId ?? ('run:unbound' as ReadinessRunId), signals, {
      baseSignalDensity: volume,
      volatilityWindowMinutes: Math.max(20, Math.max(0, info.peaks.length) * 3),
    }).forecast.projectedSignals;

    const directiveReadiness = info.directives.length === 0 ? 0 : Math.min(100, info.directives.length * 18);
    return {
      targetId,
      targetName: info.name,
      projectedVolume: Number((projected[projected.length - 1]?.value ?? volume).toFixed(2)),
      forecastPeak: projected.reduce((max, point) => Math.max(max, point.value), 0),
      directiveReadiness,
    };
  });

  const confidenceTotal = Math.max(...cells.map((cell) => cell.projectedVolume), 1);
  const forecastConfidence = Number(Math.min(0.98, confidenceTotal / Math.max(1, signals.length)).toFixed(3));

  return {
        runId: signals[0]?.runId ?? ('run:unbound' as ReadinessRunId),
    snapshotAt: new Date().toISOString(),
    cells,
    summary: {
      activeDirectives: directives.length,
      forecastConfidence,
      signalVolume: signals.length,
    },
  };
}

export function reconcileForecast(forecast: ReadinessForecast, plan: RecoveryReadinessPlan): ReadinessForecast {
  const profile = Math.max(1, forecast.projectedSignals.length);
  const calibrated = forecast.projectedSignals.map((entry, index) => ({
    ts: entry.ts,
    value: Number((entry.value * (plan.targets.length / Math.max(1, profile)) + index).toFixed(3)),
  }));

  return {
    ...forecast,
    projectedSignals: calibrated,
    confidence: Number(Math.min(1, forecast.confidence * Math.max(0.2, plan.signals.length / 100)).toFixed(3)),
  };
}

export function impactHeatmap(signals: readonly ReadinessSignal[], directives: readonly ReadinessDirective[]): IncidentImpactHeatCell[] {
  const envelope = mapImpactSignals(signals, directives);
  return envelope.cells
    .map((cell) => ({ ...cell, projectedVolume: Math.round(cell.projectedVolume) }))
    .sort((left, right) => right.forecastPeak - left.forecastPeak)
    .slice(0, 12);
}
