import { useMemo } from 'react';

interface PluginStatusCardProps {
  readonly tenantId: string;
  readonly owner: string;
  readonly profile: string;
  readonly stageCount: number;
  readonly events: readonly string[];
  readonly runId: string | null;
}

interface EventSummary {
  readonly total: number;
  readonly errors: number;
  readonly uniques: number;
}

const summarizeEvents = (events: readonly string[]): EventSummary => {
  const seen = new Set(events);
  const errors = events.filter((entry) => entry.includes('error') || entry.includes('fail')).length;
  return {
    total: events.length,
    errors,
    uniques: seen.size,
  };
};

export const PluginStatusCard = ({
  tenantId,
  owner,
  profile,
  stageCount,
  events,
  runId,
}: PluginStatusCardProps) => {
  const summary = useMemo(() => summarizeEvents(events), [events]);
  const stageCoverage = useMemo(() => {
    return stageCount === 0 ? 0 : Math.round((summary.uniques / stageCount) * 100);
  }, [summary.uniques, stageCount]);

  return (
    <section className="plugin-status-card">
      <h3>Run profile</h3>
      <dl>
        <dt>Tenant</dt>
        <dd>{tenantId}</dd>
        <dt>Owner</dt>
        <dd>{owner}</dd>
        <dt>Profile</dt>
        <dd>{profile}</dd>
        <dt>Run</dt>
        <dd>{runId ?? 'not executed'}</dd>
        <dt>Stages</dt>
        <dd>{stageCount}</dd>
        <dt>Events</dt>
        <dd>{summary.total}</dd>
        <dt>Errors</dt>
        <dd>{summary.errors}</dd>
      </dl>
      <p>
        Coverage
        {' '}
        <strong>{stageCoverage}%</strong>
      </p>
      <ul>
        {events.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
};
