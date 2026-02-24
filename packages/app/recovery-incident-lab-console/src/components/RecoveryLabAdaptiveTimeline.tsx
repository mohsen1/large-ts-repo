import { type ReactElement, useMemo, useState } from 'react';
import type { CampaignDiagnostic } from '@domain/recovery-lab-adaptive-orchestration';
import type { PluginEvent } from '@shared/stress-lab-runtime';

interface TimelineProps {
  readonly diagnostics: readonly CampaignDiagnostic[];
  readonly events: readonly PluginEvent[];
}

interface Grouped {
  readonly source: string;
  readonly items: readonly CampaignDiagnostic[];
}

const Bucket = ({ group }: { readonly group: Grouped }): ReactElement => {
  const tail = group.items.at(-1);
  return (
    <section className="timeline-bucket">
      <h4>{group.source}</h4>
      <p>{group.items.length} events</p>
      {tail && (
        <p>
          latest: {tail.phase} {tail.at}
        </p>
      )}
      <ul>
        {group.items.map((item) => (
          <li key={`${item.at}:${item.pluginId}`}>
            {item.at} {item.phase} {item.pluginId}
            <br />
            {item.message}
          </li>
        ))}
      </ul>
    </section>
  );
};

export const RecoveryLabAdaptiveTimeline = ({ diagnostics, events }: TimelineProps): ReactElement => {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');

  const filteredDiagnostics = useMemo(() => {
    if (filter === 'all') {
      return diagnostics;
    }
    return diagnostics.filter((item) => item.tags.includes(filter));
  }, [diagnostics, filter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CampaignDiagnostic[]>();
    for (const item of filteredDiagnostics) {
      const next = groups.get(item.source) ?? [];
      next.push(item);
      groups.set(item.source, next);
    }
    return [...groups.entries()].map(([source, items]) => ({ source, items }));
  }, [filteredDiagnostics]);

  const feed = useMemo(() => {
    const ordered = [...events].toSorted((left, right) => left.at.localeCompare(right.at));
    return ordered
      .slice(-20)
      .map((event) => `${event.at} ${event.name} ${String(Object.keys(event.metadata).length)}`)
      .join('\n');
  }, [events]);

  return (
    <article className="adaptive-timeline">
      <header>
        <h3>Adaptive timeline</h3>
        <select value={filter} onChange={(event) => {
          const value = event.target.value;
          if (value === 'all' || value === 'error' || value === 'warn') {
            setFilter(value);
          }
        }}>
          <option value="all">all</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
        </select>
      </header>

      <section>
        <h4>Plugin feed</h4>
        <pre>{feed || 'no events yet'}</pre>
      </section>

      <section className="adaptive-groups">
        {grouped.map((group) => (
          <Bucket key={group.source} group={group} />
        ))}
        {grouped.length === 0 && <p>No diagnostics yet</p>}
      </section>
    </article>
  );
};
