import { useMemo } from 'react';
import type { ChaosRunEvent } from '@service/recovery-chaos-orchestrator';

export interface ChaosSessionTimelineProps {
  readonly events: readonly ChaosRunEvent[];
}

export interface TimelineNode {
  readonly at: number;
  readonly kind: string;
  readonly title: string;
  readonly payload: string;
}

function normalize(event: ChaosRunEvent): TimelineNode {
  return {
    at: Number(event.at),
    kind: event.kind,
    title: String(event.kind),
    payload: JSON.stringify(event, null, 2)
  };
}

export function ChaosSessionTimeline({ events }: ChaosSessionTimelineProps) {
  const ordered = useMemo(() => [...events].sort((lhs, rhs) => Number(lhs.at) - Number(rhs.at)), [events]);

  return (
    <section className="chaos-session-timeline">
      <h4>Session timeline</h4>
      <ol>
        {ordered.map((event) => {
          const node = normalize(event);
          return (
            <li key={`${node.at}-${node.kind}`}>
              <time>{new Date(node.at).toISOString()}</time>
              <strong>{node.title}</strong>
              <pre>{node.payload}</pre>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
