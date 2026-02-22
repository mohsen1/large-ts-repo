import type {
  ReadinessDirective,
  ReadinessRunId,
  ReadinessSignal,
  RecoveryReadinessPlan,
} from './types';
import type { ReadinessPolicy } from './policy';
import { weightedRiskDensity, buildSignalMatrix } from './signal-matrix';
import { foldSignals } from './signals';

export interface RunlineEvent {
  readonly at: string;
  readonly type: 'signal' | 'directive' | 'snapshot';
  readonly title: string;
  readonly details: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ReadinessRunlineSnapshot {
  readonly runId: ReadinessRunId;
  readonly startedAt: string;
  readonly eventCount: number;
  readonly trend: 'stable' | 'ramping' | 'degraded';
  readonly signalDensity: number;
  readonly directiveUtilization: number;
  readonly events: readonly RunlineEvent[];
}

export interface ReadinessRunlineInput {
  readonly runId: ReadinessRunId;
  readonly plan: RecoveryReadinessPlan;
  readonly signals: readonly ReadinessSignal[];
  readonly directives: readonly ReadinessDirective[];
  readonly policy: ReadinessPolicy;
}

export function buildReadinessRunline(input: ReadinessRunlineInput): ReadinessRunlineSnapshot {
  const events: RunlineEvent[] = [];
  const matrix = buildSignalMatrix(input.signals);
  const signalSummary = foldSignals(input.signals);

  events.push({
    at: input.plan.createdAt,
    type: 'snapshot',
    title: 'plan-created',
    details: `owner=${input.plan.metadata.owner}`,
    severity: 'low',
  });

  const signalDensity = weightedRiskDensity(input.signals);
  const directiveUtilization = input.directives.length > 0 ? input.signals.length / input.directives.length : 0;

  input.signals.forEach((signal, index) => {
    events.push({
      at: signal.capturedAt,
      type: 'signal',
      title: `signal:${signal.source}`,
      details: `${signal.name}:${signal.severity}`,
      severity: signal.severity,
    });
    if ((index + 1) % 3 === 0) {
      events.push({
        at: signal.capturedAt,
        type: 'snapshot',
        title: `checkpoint:${index + 1}`,
        details: `cumulative=${matrix.totalSignals}`,
        severity: input.signals[index]?.severity ?? 'low',
      });
    }
  });

  let lastAt = input.plan.createdAt;
  for (const directive of input.directives) {
    const signalIndex = indexForSignal(directive.dependsOn.length, input.signals, lastAt);
    events.push({
      at: input.signals[signalIndex]?.capturedAt ?? new Date(Date.parse(lastAt)).toISOString(),
      type: 'directive',
      title: directive.name,
      details: `timeout=${directive.timeoutMinutes},retries=${directive.retries}`,
      severity: directive.enabled ? 'low' : 'medium',
    });
    lastAt = new Date(Date.parse(lastAt) + directive.timeoutMinutes * 60 * 1000).toISOString();
  }

  const trend = chooseRunlineTrend(signalSummary, signalDensity);
  const policyOverrides = policyPenalty(input.policy, input.signals, input.directives);

  return {
    runId: input.runId,
    startedAt: input.plan.createdAt,
    eventCount: events.length,
    trend: policyOverrides ? 'degraded' : trend,
    signalDensity: Number(signalDensity.toFixed(3)),
    directiveUtilization: Number(directiveUtilization.toFixed(2)),
    events: events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at)),
  };
};

export function runlineTimeline(input: readonly ReadinessRunlineInput[]): ReadonlyMap<ReadinessRunId, ReadinessRunlineSnapshot> {
  return new Map(input.map((entry) => [entry.runId, buildReadinessRunline(entry)]));
}

export function buildRunlineDigest(values: ReadonlyMap<ReadinessRunId, ReadinessRunlineSnapshot>): {
  readonly totalRuns: number;
  readonly criticalRuns: number;
  readonly meanTrend: 'stable' | 'ramping' | 'degraded';
  readonly topSignals: readonly { runId: ReadinessRunId; count: number }[];
} {
  const snapshots = [...values.values()];
  const totalRuns = snapshots.length;
  const criticalRuns = snapshots.filter((snapshot) => snapshot.signalDensity > 5).length;

  const trendWeight = {
    stable: 0,
    ramping: 1,
    degraded: 2,
  };
  const meanTrendWeight = snapshots.reduce((acc, snapshot) => acc + trendWeight[snapshot.trend], 0) / Math.max(1, snapshots.length);
  const meanTrend = meanTrendWeight > 1.3 ? 'degraded' : meanTrendWeight > 0.5 ? 'ramping' : 'stable';

  const topSignals = snapshots
    .map((snapshot) => ({
      runId: snapshot.runId,
      count: snapshot.eventCount,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);

  return {
    totalRuns,
    criticalRuns,
    meanTrend,
    topSignals,
  };
}

export function filterRunlineByDensity(
  timeline: ReadonlyMap<ReadinessRunId, ReadinessRunlineSnapshot>,
  minDensity: number,
): readonly ReadinessRunId[] {
  const selected: ReadinessRunId[] = [];
  for (const [runId, snapshot] of timeline) {
    if (snapshot.signalDensity >= minDensity) {
      selected.push(runId);
    }
  }
  return selected;
}

function indexFromDependencies(sourceLength: number, signals: readonly ReadinessSignal[], seed: string): number {
  if (!signals.length) {
    return Number.isNaN(Date.parse(seed)) ? 0 : Math.max(0, signals.length - 1);
  }
  const seedValue = seed.length % Math.max(1, signals.length);
  return Math.max(0, Math.min(signals.length - 1, sourceLength + seedValue));
}

function indexForSignal(dependsOnCount: number, signals: readonly ReadinessSignal[], fallback: string): number {
  const fallbackIndex = indexFromDependencies(dependsOnCount, signals, fallback);
  if (!signals[fallbackIndex]) {
    return 0;
  }
  return fallbackIndex;
}

function chooseRunlineTrend(summary: ReturnType<typeof foldSignals>, density: number): 'stable' | 'ramping' | 'degraded' {
  if (summary.riskBand === 'red') {
    return 'degraded';
  }
  if (density > 3 || summary.weightedScore > 20) {
    return 'ramping';
  }
  return 'stable';
}

function policyPenalty(policy: ReadinessPolicy, signals: readonly ReadinessSignal[], directives: readonly ReadinessDirective[]): boolean {
  const blockedSourceDensity = signals.filter((signal) => policy.blockedSignalSources.includes(signal.source)).length;
  const directiveDisabled = directives.some((directive) => !directive.enabled);
  return blockedSourceDensity > 0 || directiveDisabled || policy.constraints.minTargetCoveragePct > 0.7;
}
