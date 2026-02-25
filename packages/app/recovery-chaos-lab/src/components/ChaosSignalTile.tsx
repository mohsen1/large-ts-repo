import { type ReactNode, useMemo } from 'react';
import type { ControlPlaneEvent } from '../services/chaosControlPlane';

export interface ChaosSignalTileProps {
  readonly namespace: string;
  readonly events: readonly ControlPlaneEvent[];
  readonly maxRows?: number;
}

export function ChaosSignalTile({ namespace, events, maxRows = 8 }: ChaosSignalTileProps) {
  const trimmed = useMemo(() => {
    const ordered = [...events].toSorted((left, right) => right.at - left.at);
    return ordered.slice(0, maxRows);
  }, [events, maxRows]);

  const byKind = useMemo(() => {
    const buckets = new Map<string, ControlPlaneEvent[]>();
    for (const event of events) {
      const list = buckets.get(event.kind) ?? [];
      list.push(event);
      buckets.set(event.kind, list);
    }
    return [...buckets.entries()]
      .sort(([lhs], [rhs]) => lhs.localeCompare(rhs))
      .map(([kind, entries]) => ({ kind, count: entries.length }));
  }, [events]);

  return (
    <article className="chaos-signal-tile">
      <header>
        <h3>Signal Tile</h3>
        <p>{namespace}</p>
      </header>
      <ul>
        {trimmed.map((event, index) => (
          <li key={`${event.kind}-${index}-${event.at}`}>
            <strong>{event.kind}</strong>
            <time>{new Date(event.at).toISOString()}</time>
            <span>{JSON.stringify(event.payload)}</span>
          </li>
        ))}
      </ul>
      <section>
        <h4>By kind</h4>
        <ul>
          {byKind.map((entry) => (
            <li key={entry.kind}>
              <span>{entry.kind}</span>
              <span>{entry.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function renderUnknown(value: unknown): ReactNode {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '[complex]';
}
