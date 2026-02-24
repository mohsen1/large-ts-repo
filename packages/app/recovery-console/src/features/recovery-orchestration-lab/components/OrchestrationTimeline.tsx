import { memo, useMemo, type ReactElement } from 'react';
import type { RunStep } from '../domain/models';
import type { EngineResult } from '../services/orchestration-engine';

export interface OrchestrationTimelineProps {
  readonly title: string;
  readonly timeline: readonly RunStep[];
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
}

type TimelineStatus = RunStep['status'];

const styleByStatus: { [key in TimelineStatus]: string } = {
  idle: 'timeline-step--idle',
  running: 'timeline-step--running',
  success: 'timeline-step--success',
  skipped: 'timeline-step--skipped',
  degraded: 'timeline-step--degraded',
  failed: 'timeline-step--failed',
};

const totalMs = (steps: readonly RunStep[]): number => steps.reduce((acc, step) => acc + step.elapsedMs, 0);

const timelineDurations = (steps: readonly RunStep[]) =>
  steps.map((step, index) => ({
    plugin: step.plugin,
    bucket: ((step.elapsedMs / Math.max(1, totalMs(steps))) * 100).toFixed(1),
    status: step.status,
    startedAt: step.startedAt,
    details: step.details,
    index,
  }));

export const OrchestrationTimeline = memo(function OrchestrationTimeline(props: OrchestrationTimelineProps): ReactElement {
  const items = useMemo(() => timelineDurations(props.timeline), [props.timeline]);

  return (
    <section className="orchestration-timeline">
      <h3>{props.title}</h3>
      <div className="timeline-strip" role="list" aria-label="execution timeline">
        {items.map((item) => (
          <button
            key={`${item.plugin}-${item.index}`}
            type="button"
            className={`timeline-step ${styleByStatus[item.status]}`}
            onClick={() => props.onSelect(item.index)}
          >
            <strong>{item.plugin}</strong>
            <span>{item.status}</span>
            <small>{item.bucket}%</small>
            <small>{item.startedAt}</small>
            {item.details ? <small>{Object.keys(item.details).join(',')}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
});

export const sumTimeline = (result: EngineResult): number => totalMs(result.snapshot.timeline);
