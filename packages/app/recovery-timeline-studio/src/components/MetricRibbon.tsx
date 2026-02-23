import { aggregateHealth } from '@domain/recovery-timeline';
import { RecoveryTimeline } from '@domain/recovery-timeline';

interface MetricRibbonProps {
  timeline: RecoveryTimeline | undefined;
}

export function MetricRibbon({ timeline }: MetricRibbonProps) {
  if (!timeline) {
    return <div>No metrics available</div>;
  }

  const health = aggregateHealth(timeline.events);
  const ratio = timeline.events.length ? Math.round((health.completedCount / timeline.events.length) * 100) : 0;

  return (
    <section>
      <h3>Health</h3>
      <dl>
        <div>
          <dt>Completion</dt>
          <dd>{ratio}%</dd>
        </div>
        <div>
          <dt>Running</dt>
          <dd>{health.runningCount}</dd>
        </div>
        <div>
          <dt>Blocked</dt>
          <dd>{health.blockedCount}</dd>
        </div>
        <div>
          <dt>Failure Rate</dt>
          <dd>{health.failureRate}%</dd>
        </div>
        <div>
          <dt>Avg Risk</dt>
          <dd>{health.riskScoreAverage}</dd>
        </div>
      </dl>
    </section>
  );
}
