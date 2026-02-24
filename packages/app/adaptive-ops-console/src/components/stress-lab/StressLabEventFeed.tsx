import { useMemo } from 'react';
import type { OrchestratorReport } from '@domain/recovery-stress-lab';

interface StressLabEventFeedProps {
  readonly report: OrchestratorReport | null;
}

interface EventItem {
  readonly phase: string;
  readonly at: string;
  readonly kind: 'info' | 'warn' | 'ok';
}

const classify = (phase: string): EventItem['kind'] => {
  if (phase.includes('invalid')) return 'warn';
  if (phase.includes('valid')) return 'ok';
  return 'info';
};

const buildEvents = (report: OrchestratorReport | null): readonly EventItem[] => {
  if (!report) {
    return [];
  }

  const fromPhases = report.telemetry.phaseLabels.map((phase) => ({
    phase,
    at: new Date().toISOString(),
    kind: classify(phase),
  }));
  const fromWarnings = report.warnings.map((warning) => ({
    phase: warning,
    at: new Date(Date.now() + 1000).toISOString(),
    kind: 'warn' as const,
  }));

  return [...fromPhases, ...fromWarnings].toSorted((left, right) => left.at.localeCompare(right.at));
};

const EventBullet = ({ item }: { readonly item: EventItem }) => {
  const marker = item.kind === 'warn' ? '⚠' : item.kind === 'ok' ? '✓' : '•';
  return (
    <li>
      <strong>{marker}</strong>
      <code>{item.at}</code>
      <span>{item.phase}</span>
    </li>
  );
};

export const StressLabEventFeed = ({ report }: StressLabEventFeedProps) => {
  const events = useMemo(() => buildEvents(report), [report]);
  const summary = useMemo(() => {
    const map = events.reduce(
      (acc, item) => {
        acc[item.kind] += 1;
        return acc;
      },
      { info: 0, warn: 0, ok: 0 } as Record<EventItem['kind'], number>,
    );
    return map;
  }, [events]);

  const rows = events.map((item) => <EventBullet key={`${item.at}-${item.phase}`} item={item} />);

  return (
    <section className="stress-lab-event-feed">
      <h3>Orchestration feed</h3>
      <p>
        Info {summary.info} · Warn {summary.warn} · Ok {summary.ok}
      </p>
      <ul>{rows}</ul>
    </section>
  );
};
