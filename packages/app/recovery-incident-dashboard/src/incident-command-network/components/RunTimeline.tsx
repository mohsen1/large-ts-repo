import { useMemo } from 'react';
import type { RuntimeIntent, RoutingDecision, DriftObservation } from '@domain/recovery-command-network';

interface RunTimelinePoint {
  readonly when: string;
  readonly type: 'intent' | 'decision' | 'drift';
  readonly label: string;
}

interface RunTimelineProps {
  readonly intents: readonly RuntimeIntent[];
  readonly decisions: readonly RoutingDecision[];
  readonly drifts: readonly DriftObservation[];
  readonly maxRows?: number;
}

const buildTimeline = (
  intents: readonly RuntimeIntent[],
  decisions: readonly RoutingDecision[],
  drifts: readonly DriftObservation[],
  maxRows: number,
): readonly RunTimelinePoint[] => {
  const points: RunTimelinePoint[] = [];

  for (const intent of intents) {
    points.push({
      when: intent.createdAt,
      type: 'intent',
      label: `${intent.intentId} priority=${intent.priority}`,
    });
  }

  for (const decision of decisions) {
    points.push({
      when: new Date().toISOString(),
      type: 'decision',
      label: `${decision.nodeId} ${decision.score.toFixed(2)} ${decision.accepted ? 'allow' : 'blocked'}`,
    });
  }

  for (const drift of drifts) {
    points.push({
      when: drift.at,
      type: 'drift',
      label: `${drift.drift} ${drift.reason}`,
    });
  }

  points.sort((left, right) => Date.parse(left.when) - Date.parse(right.when));
  return points.slice(-maxRows);
};

const typeStyle = (type: RunTimelinePoint['type']) => {
  if (type === 'intent') {
    return 'timeline-intent';
  }
  if (type === 'decision') {
    return 'timeline-decision';
  }
  return 'timeline-drift';
};

export const RunTimeline = ({ intents, decisions, drifts, maxRows = 16 }: RunTimelineProps) => {
  const rows = useMemo(() => buildTimeline(intents, decisions, drifts, maxRows), [decisions, drifts, intents, maxRows]);
  return (
    <section className="command-run-timeline">
      <h3>Run timeline</h3>
      <ul>
        {rows.map((row) => (
          <li key={`${row.when}-${row.type}-${row.label}`} className={typeStyle(row.type)}>
            <time>{new Date(row.when).toLocaleTimeString()}</time>
            <span>{row.type}</span>
            <span>{row.label}</span>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p>No timeline events</p> : null}
    </section>
  );
};
