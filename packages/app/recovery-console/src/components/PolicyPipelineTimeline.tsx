import { useMemo } from 'react';
import type { PolicyTimeline } from '@service/recovery-operations-policy-engine';

interface PolicyPipelineTimelineProps {
  readonly timelines: readonly PolicyTimeline[];
}

const statusLabel = (status: PolicyTimeline['points'][number]['status']): string => {
  if (status === 'ok') return '✅';
  if (status === 'warn') return '⚠️';
  return '⛔';
};

const formatLine = (point: PolicyTimeline['points'][number]): string => {
  return `${statusLabel(point.status)} ${point.phase} - ${point.message}`;
};

export const PolicyPipelineTimeline = ({ timelines }: PolicyPipelineTimelineProps) => {
  const blocks = useMemo(() => {
    return timelines.map((timeline) => ({
      runId: timeline.runId,
      tenant: timeline.tenant,
      points: timeline.points.map((point) => ({
        ...point,
        at: new Date(point.at).toISOString(),
        text: formatLine(point),
      })),
    }));
  }, [timelines]);

  return (
    <section className="policy-pipeline-timeline">
      <h3>Policy timeline stream</h3>
      {blocks.map((block) => (
        <article key={`${block.tenant}-${block.runId}`} className="timeline-block">
          <h4>
            {block.tenant} / {block.runId}
          </h4>
          <ol>
            {block.points.map((point) => (
              <li key={`${point.at}-${point.phase}`}>
                <span className={point.status}>{point.text}</span>
                <small>{point.at}</small>
              </li>
            ))}
          </ol>
        </article>
      ))}
      {blocks.length === 0 && <p>No timeline events.</p>}
    </section>
  );
};
