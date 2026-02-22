import { clamp, parseISODate, safePercent } from './utils';
import { computeRunRisk } from './risk';
import type { RecoveryDrillRunLike } from './risk';
import type { DrillExecutionProfile } from './types';

interface RunLike {
  readonly id: string;
  readonly templateId: string;
  readonly status: string;
  readonly mode: string;
  readonly profile: DrillExecutionProfile;
  readonly checkpoints: readonly string[] | readonly DrillCheckpointLike[];
  readonly context?: {
    readonly runId: string;
    readonly templateId: string;
    readonly runAt: string;
    readonly initiatedBy: string;
    readonly mode: string;
    readonly approvals: number;
  };
  readonly startedAt?: string;
}

interface DrillCheckpointLike {
  readonly at: string;
  readonly stepId: string;
  readonly status: string;
  readonly durationMs: number;
}

interface TemplateLike {
  readonly templateId: string;
  readonly tenantId: string;
  readonly template?: { tenantId: string };
}

export interface DrillTimelinePoint {
  readonly at: string;
  readonly runId: string;
  readonly risk: number;
  readonly status: string;
}

export interface DrillTimelineSummary {
  readonly totalPoints: number;
  readonly maxRisk: number;
  readonly minRisk: number;
  readonly avgRisk: number;
  readonly trend: 'up' | 'down' | 'flat';
}

export interface DrillTelemetryWindow {
  readonly tenantId: string;
  readonly from: string;
  readonly to: string;
  readonly points: readonly DrillTimelinePoint[];
  readonly metrics: {
    readonly avgLatencyMs: number;
    readonly successRate: number;
    readonly queueDepth: number;
  };
}

const asCheckpoint = (checkpoint: string): DrillCheckpointLike => ({
  at: checkpoint,
  stepId: 'unknown',
  status: 'warned',
  durationMs: 0,
});

const checkpointsToTelemetry = (run: RunLike): readonly DrillCheckpointLike[] =>
  run.checkpoints.map((checkpoint) => (typeof checkpoint === 'string' ? asCheckpoint(checkpoint) : checkpoint));

const toProfiledRun = (run: RunLike): RecoveryDrillRunLike => ({
  id: run.id,
  templateId: run.templateId,
  status: run.status as RecoveryDrillRunLike['status'],
  mode: run.mode as RecoveryDrillRunLike['mode'],
  profile: run.profile,
  checkpoints: checkpointsToTelemetry(run),
  context: {
    runId: run.context?.runId ?? run.id,
    templateId: run.context?.templateId ?? run.templateId,
    runAt: run.context?.runAt ?? run.startedAt ?? new Date().toISOString(),
    initiatedBy: run.context?.initiatedBy ?? 'system',
    mode: (run.context?.mode ?? run.mode) as RecoveryDrillRunLike['mode'],
    approvals: run.context?.approvals ?? 0,
  },
});

const timelineForRun = (run: RunLike): DrillTimelinePoint[] => {
  const canonical = toProfiledRun(run);
  const started = parseISODate(run.startedAt ?? run.context?.runAt ?? new Date().toISOString());
  const checkpoints = canonical.checkpoints.length;
  const step = checkpoints === 0 ? 1 : checkpoints;
  const risk = computeRunRisk(canonical);

  return Array.from({ length: Math.min(12, step) }, (_, index) => ({
    at: new Date(started + index * 1000).toISOString(),
    runId: run.id,
    risk: Number((risk * (0.6 + index * 0.04)).toFixed(2)),
    status: run.status,
  }));
};

export const buildTimelineSummary = (runs: readonly RunLike[]): DrillTimelineSummary => {
  const points = runs.flatMap(timelineForRun).sort((left, right) => left.at.localeCompare(right.at));
  if (points.length === 0) {
    return { totalPoints: 0, maxRisk: 0, minRisk: 0, avgRisk: 0, trend: 'flat' };
  }

  const risks = points.map((point) => point.risk);
  const first = points[0]?.risk;
  const last = points.at(-1)?.risk;
  const trend = first === undefined || last === undefined || first === last ? 'flat' : last > first ? 'up' : 'down';

  return {
    totalPoints: points.length,
    maxRisk: Math.max(...risks),
    minRisk: Math.min(...risks),
    avgRisk: Number((risks.reduce((sum, risk) => sum + risk, 0) / risks.length).toFixed(2)),
    trend,
  };
};

export const buildTelemetryWindow = (
  runs: readonly RunLike[],
  tenantId: string,
  from: string,
  to: string,
): DrillTelemetryWindow => {
  const fromMs = parseISODate(from);
  const toMs = parseISODate(to);
  const inRange = runs.filter((run) => {
    const checkpoints = checkpointsToTelemetry(run);
    const first = checkpoints[0]?.at ?? run.startedAt ?? new Date().toISOString();
    const last = checkpoints.at(-1)?.at ?? run.startedAt ?? new Date().toISOString();
    return parseISODate(first) >= fromMs && parseISODate(last) <= toMs;
  });

  const points = inRange
    .flatMap(timelineForRun)
    .filter((point) => {
      const at = parseISODate(point.at);
      return at >= fromMs && at <= toMs;
    })
    .sort((left, right) => left.at.localeCompare(right.at));

  const metrics = summarizeProfiles(inRange);
  return { tenantId, from, to, points, metrics };
};

export const summarizeProfiles = (runs: readonly RunLike[]) => {
  if (runs.length === 0) return { avgLatencyMs: 0, successRate: 0, queueDepth: 0 };
  return {
    avgLatencyMs: Number((runs.reduce((sum, run) => sum + run.profile.elapsedMs, 0) / runs.length).toFixed(2)),
    successRate: Number((runs.reduce((sum, run) => sum + run.profile.successRate, 0) / runs.length).toFixed(4)),
    queueDepth: Number((runs.reduce((sum, run) => sum + run.profile.queueDepth, 0) / runs.length).toFixed(2)),
  };
};

export const summarizeTemplateHeatpoints = (
  templates: readonly TemplateLike[],
  runRecords: readonly RunLike[],
): ReadonlyArray<{ templateId: string; runCount: number; avgSuccess: number; trend: 'up' | 'down' | 'flat' }> => {
  return templates.map((templateRecord) => {
    const templateRuns = runRecords.filter((record) => record.templateId === templateRecord.templateId);
    const runCount = templateRuns.length;
    const avgSuccess = runCount === 0 ? 0 : Number((templateRuns.reduce((sum, record) => sum + record.profile.successRate, 0) / runCount).toFixed(4));
    const first = templateRuns[0]?.profile.successRate;
    const last = templateRuns.at(-1)?.profile.successRate;
    const trend = first === undefined || last === undefined || first === last ? 'flat' : last > first ? 'up' : 'down';
    return { templateId: templateRecord.templateId, runCount, avgSuccess, trend };
  });
};

export const buildProfileByMode = (runs: readonly RunLike[]) => {
  const byMode = new Map<string, { count: number; success: number }>();
  for (const run of runs) {
    const current = byMode.get(run.mode) ?? { count: 0, success: 0 };
    current.count += 1;
    current.success += run.profile.successRate;
    byMode.set(run.mode, current);
  }

  return new Map(
    [...byMode.entries()].map(([mode, value]) => [
      mode,
      { count: value.count, success: value.count === 0 ? 0 : Number((value.success / value.count).toFixed(4)) },
    ]),
  );
};

export const buildTenantDigest = (profiles: readonly RunLike[]): number => {
  if (profiles.length === 0) return 0;
  const risks = profiles.map((run) => computeRunRisk({
    ...toProfiledRun(run),
  }));
  const success = profiles.reduce((sum, run) => sum + run.profile.successRate, 0) / profiles.length;
  const latency = profiles.reduce((sum, run) => sum + run.profile.estimatedMs, 0) / profiles.length;
  return Number((safePercent(risks.reduce((sum, risk) => sum + risk, 0), risks.length * 100) * (1 - clamp(success, 0, 1) * 0.8)).toFixed(2));
};
