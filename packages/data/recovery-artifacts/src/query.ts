import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryArtifact } from './models';
import type { RecoveryArtifactFilter } from './models';

import type { RecoveryTimelineSegment, RecoveryTrace } from './models';

export interface ArtifactSpan {
  readonly runId: RecoveryRunState['runId'];
  readonly records: readonly RecoveryArtifact[];
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export const groupArtifactsByRun = (artifacts: readonly RecoveryArtifact[]): readonly ArtifactSpan[] => {
  const grouped = new Map<string, RecoveryArtifact[]>();
  for (const artifact of artifacts) {
    const list = grouped.get(artifact.runId) ?? [];
    grouped.set(artifact.runId, [...list, artifact]);
  }
  return Array.from(grouped.entries()).map(([runId, values]) => ({
    runId: runId as RecoveryRunState['runId'],
    records: values.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)),
    firstSeen: values[0]?.recordedAt ?? new Date().toISOString(),
    lastSeen: values[values.length - 1]?.recordedAt ?? new Date().toISOString(),
  }));
};

export const computeActiveRuns = (
  artifacts: readonly RecoveryArtifact[],
  now = new Date().toISOString(),
): readonly RecoveryRunState['runId'][] => groupArtifactsByRun(artifacts)
  .filter((span) => {
    if (!span.lastSeen) return false;
    return Date.parse(now) - Date.parse(span.lastSeen) < 10 * 60 * 1000;
  })
  .map((span) => span.runId);

export const summarizeByService = (
  artifacts: readonly RecoveryArtifact[],
): ReadonlyMap<string, readonly RecoveryArtifact[]> => {
  const out = new Map<string, RecoveryArtifact[]>();
  for (const artifact of artifacts) {
    const key = `${artifact.program.tenant}:${artifact.program.service}`;
    const next = out.get(key) ?? [];
    next.push(artifact);
    out.set(key, next);
  }
  return out;
};

export const buildTrace = (
  artifacts: readonly RecoveryArtifact[],
  runId: RecoveryRunState['runId'],
): RecoveryTrace | undefined => {
  const span = groupArtifactsByRun(artifacts).find((entry) => entry.runId === runId);
  if (!span) return undefined;
  const segments = span.records.reduce<RecoveryTimelineSegment[]>((acc, record, index) => {
    const previous = span.records[index - 1];
    const segment: RecoveryTimelineSegment = {
      name: `step-${record.checkpoint?.stepId ?? 'start'}`,
      startedAt: previous?.recordedAt ?? record.recordedAt,
      completedAt: record.recordedAt,
      durationMs: previous ? Date.parse(record.recordedAt) - Date.parse(previous.recordedAt) : 0,
      healthy: record.run.status !== 'failed',
      details: {
        stepId: record.checkpoint?.stepId ?? '',
        status: record.run.status,
      },
    };
    return [...acc, segment];
  }, []);

  return { runId, segments };
};
