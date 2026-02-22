import { useMemo } from 'react';
import type { ReadinessRunId } from '@domain/recovery-readiness';
import { queryTimeline } from '@data/recovery-readiness-store';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { buildStreamDigest } from '@service/recovery-readiness-orchestrator';

interface TimelinePoint {
  readonly at: string;
  readonly runId: ReadinessRunId;
  readonly events: number;
}

interface ReadinessTimelineExplorerProps {
  readonly runs: readonly ReadinessReadModel[];
  readonly selectedRunId?: ReadinessRunId;
}

const sortRunsByDate = (lhs: ReadinessReadModel, rhs: ReadinessReadModel): number =>
  new Date(rhs.updatedAt).getTime() - new Date(lhs.updatedAt).getTime();

export const ReadinessTimelineExplorer = ({ runs, selectedRunId }: ReadinessTimelineExplorerProps) => {
  const points = useMemo<TimelinePoint[]>(() => {
    return queryTimeline(runs).map((point) => ({
      at: point.at,
      runId: point.runId,
      events: point.signals,
    }));
  }, [runs]);

  const summary = useMemo(() => {
    const digest = buildStreamDigest(runs);
    const selected = runs.find((run) => run.plan.runId === selectedRunId);
    return {
      streamId: digest.streamId,
      events: digest.eventCount,
      selectedOwner: selected?.plan.metadata.owner,
      selectedSignals: selected?.signals.length ?? 0,
    };
  }, [runs, selectedRunId]);

  const orderedRuns = useMemo(() => [...runs].sort(sortRunsByDate), [runs]);

  return (
    <section>
      <h2>Readiness timeline explorer</h2>
      <p>{`stream:${summary.streamId}`}</p>
      <p>{`events:${summary.events}`}</p>
      <p>{`selected-owner:${summary.selectedOwner ?? 'none'}`}</p>
      <p>{`selected-signals:${summary.selectedSignals}`}</p>
      <h3>Run list</h3>
      <ul>
        {orderedRuns.map((run) => (
          <li key={run.plan.runId}>
            {run.plan.runId}: {run.signals.length} signals / {run.directives.length} directives
          </li>
        ))}
      </ul>
      <h3>Timeline points</h3>
      <ul>
        {points.slice(0, 20).map((point) => (
          <li key={`${point.at}:${point.runId}`}>
            {point.at} · {point.runId}: {point.events}
          </li>
        ))}
      </ul>
      <p>{selectedRunId ? `Tracking ${selectedRunId}` : 'No run selected'}</p>
    </section>
  );
};
