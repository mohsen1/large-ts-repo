import { memo, useMemo } from 'react';
import type { OrionTimelineEvent, OrionWorkspaceState } from '../types';
import type { EventRoute, EventShape } from '@shared/type-level/stress-orion-template-math';
import { buildEventEnvelope } from '@shared/type-level/stress-orion-template-math';

interface OrionSignalTimelineProps {
  readonly timeline: readonly OrionTimelineEvent[];
  readonly status: OrionWorkspaceState;
}

const classifyTimelineSeverity = (route: string): 'high' | 'medium' | 'low' => {
  if (route.includes('critical')) {
    return 'high';
  }
  if (route.includes('high') || route.includes('warning') || route.includes('medium')) {
    return 'medium';
  }
  return 'low';
};

export const OrionSignalTimeline = memo(({ timeline, status }: OrionSignalTimelineProps) => {
  const grouped = useMemo(() => {
    const map = new Map<string, OrionTimelineEvent[]>();
    for (const row of timeline) {
      const bucket = `${row.stage}-${classifyTimelineSeverity(row.id)}`;
      const current = map.get(bucket) ?? [];
      current.push(row);
      map.set(bucket, current);
    }
    return map;
  }, [timeline]);

  const labels = ['high', 'medium', 'low'] as const;

  const routeDiagnostics = (route: EventRoute) => {
    const parsed = buildEventEnvelope(route);
    const shape: EventShape<typeof route> = parsed;
    return `${shape.span}/${shape.sector}/${shape.action}`;
  };

  return (
    <section>
      <h3>
        Timeline ({status})
      </h3>
      {labels.map((label) => {
        const rows = grouped.get(`complete-${label}`) ?? [];
        const idleRows = grouped.get(`idle-${label}`) ?? [];
        const observeRows = grouped.get(`observing-${label}`) ?? [];

        if (rows.length === 0 && idleRows.length === 0 && observeRows.length === 0) {
          return null;
        }

      return (
          <article key={label}>
            <header>
              <strong>{label.toUpperCase()}</strong>
            </header>
            {[...rows, ...idleRows, ...observeRows].map((entry, index) => {
              const severity = classifyTimelineSeverity(entry.id);
              const diagnostic = 'parts' in entry.envelope && entry.envelope.kind === 'route'
                ? routeDiagnostics('/wave-center-open/id-1/critical')
                : 'n/a';
              return (
                <p key={`${entry.envelope.kind}-${index}`} style={{ margin: '2px 0' }}>
                  <span>{entry.stage}</span>
                  {' -> '}
                  <span>{entry.envelope.kind}</span>
                  {' / '}
                  <span>{severity}</span>
                  {' / '}
                  <span>{entry.emittedAt}</span>
                  {' / '}
                  <span>{diagnostic}</span>
                </p>
              );
            })}
          </article>
        );
      })}
    </section>
  );
});
