import type { DrillStatus } from './types';

export interface DrillForensicsTrace {
  readonly runId: string;
  readonly templateId: string;
  readonly checkpointTrail: readonly string[];
  readonly checkpointCount: number;
  readonly status: DrillStatus;
  readonly durationMs: number;
  readonly createdAt: string;
}

export interface TraceSlice {
  readonly tenantId: string;
  readonly templateId: string;
  readonly status: DrillStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly mode: string;
  readonly sample: number;
}

export interface ForensicsBundle {
  readonly tenantId: string;
  readonly traces: readonly DrillForensicsTrace[];
  readonly byTemplate: ReadonlyMap<string, TraceSlice[]>;
  readonly anomalies: readonly string[];
}

export interface RawRunLike {
  readonly id: string;
  readonly templateId: string;
  readonly status: DrillStatus;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly checkpoints: readonly string[];
  readonly context?: { readonly mode: string };
}

export const inferRunDuration = (run: RawRunLike): number => {
  if (!run.startedAt || !run.endedAt) return 0;
  const started = Date.parse(run.startedAt);
  const ended = Date.parse(run.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return 0;
  if (ended < started) return 0;
  return ended - started;
};

export const fingerprintTrace = (run: RawRunLike): DrillForensicsTrace => {
  const durationMs = inferRunDuration(run);
  const checkpointTrail = run.checkpoints.map((checkpoint, index) => `${index + 1}:${checkpoint}`);
  return {
    runId: run.id,
    templateId: run.templateId,
    checkpointTrail,
    checkpointCount: checkpointTrail.length,
    status: run.status,
    durationMs,
    createdAt: run.startedAt ?? new Date().toISOString(),
  };
};

export const clusterByTemplate = (
  tenantId: string,
  runs: readonly RawRunLike[],
  templates: readonly { readonly templateId: string; readonly mode: string }[],
): ForensicsBundle => {
  const map = new Map<string, TraceSlice[]>();
  const anomalies: string[] = [];
  const templateMode = new Map(templates.map((template) => [template.templateId, template.mode]));

  for (const run of runs) {
    if (!run.context) {
      anomalies.push(`${run.id}: missing context`);
    }
    const sample = inferRunDuration(run);
    const entry = {
      tenantId,
      templateId: run.templateId,
      status: run.status,
      startedAt: run.startedAt ?? new Date().toISOString(),
      endedAt: run.endedAt ?? new Date().toISOString(),
      mode: run.context?.mode ?? templateMode.get(run.templateId) ?? 'tabletop',
      sample,
    };
    const existing = map.get(run.templateId) ?? [];
    map.set(run.templateId, [...existing, entry]);
  }

  const traces = runs
    .map((run) => fingerprintTrace(run))
    .sort((left, right) => right.checkpointCount - left.checkpointCount)
    .slice(0, 512);

  return {
    tenantId,
    traces,
    byTemplate: map,
    anomalies: Array.from(new Set(anomalies)),
  };
};

export const summarizeTemplateDrift = (bundle: ForensicsBundle): Readonly<Record<string, number>> => {
  const byTemplate: Record<string, number> = {};
  for (const [templateId, slices] of bundle.byTemplate) {
    const average = slices.length === 0 ? 0 : slices.reduce((acc, item) => acc + item.sample, 0) / slices.length;
    byTemplate[templateId] = Math.round(average);
  }
  return byTemplate;
};

export const detectReplayRisk = (bundle: ForensicsBundle, maxAgeMs: number): readonly string[] =>
  bundle.traces
    .filter((trace) => trace.durationMs > maxAgeMs)
    .filter((trace) => trace.checkpointCount > 0)
    .map((trace) => `${trace.templateId}|${trace.runId}|duration=${trace.durationMs}`);
