import { useMemo } from 'react';
import { type StreamLabExecutionReport, type StreamLabExecutionTrace, type StreamLabRequest } from '../stress-lab/types';

export interface TimelinePoint {
  readonly order: number;
  readonly label: string;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly status: StreamLabExecutionTrace['status'];
}

const normalizeStatus = (status: StreamLabExecutionTrace['status']): StreamLabExecutionTrace['status'] => {
  if (status === 'failed') return 'failed';
  if (status === 'running') return 'running';
  return 'queued';
};

export const useStreamLabTimeline = (report: StreamLabExecutionReport | null) => {
  const timeline = useMemo(() => {
    const trace = report?.traces ?? [];
    return trace
      .map((entry, index): TimelinePoint => ({
        order: index,
        label: `${entry.pluginName} / ${entry.pluginKind}`,
        startedAt: entry.startedAt,
        elapsedMs: entry.elapsedMs,
        status: normalizeStatus(entry.status),
      } as const));
  }, [report]);

  const summary = useMemo(
    () => ({
      totalSteps: timeline.length,
      totalElapsedMs: timeline.reduce((acc, item) => acc + item.elapsedMs, 0),
      failedSteps: timeline.filter((item) => item.status === 'failed').length,
      lastStarted: timeline.at(-1)?.startedAt ?? report?.request.startedAt ?? null,
      request: (report?.request.request as StreamLabRequest) ?? null,
    }),
    [report, timeline],
  );

  return { timeline, summary };
};
