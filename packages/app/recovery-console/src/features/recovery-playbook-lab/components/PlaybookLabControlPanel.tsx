import { useMemo } from 'react';
import type { PlaybookLabPageState } from '../types';

interface HeaderStat {
  readonly label: string;
  readonly value: string | number;
}

interface Props {
  readonly state: PlaybookLabPageState;
  readonly onRefresh: () => Promise<void>;
  readonly onQueue: () => Promise<void>;
  readonly onSeed: () => Promise<void>;
}

const StatCard = ({ label, value }: HeaderStat) => (
  <article className="stat-card">
    <span className="label">{label}</span>
    <strong className="value">{value}</strong>
  </article>
);

const ActionList = ({
  disabled,
  onRefresh,
  onQueue,
  onSeed,
}: {
  readonly disabled: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly onQueue: () => Promise<void>;
  readonly onSeed: () => Promise<void>;
}) => {
  return (
    <div className="actions">
      <button type="button" disabled={disabled} onClick={async () => {
        await onSeed();
      }}>
        Seed catalog
      </button>
      <button type="button" disabled={disabled} onClick={async () => {
        await onRefresh();
      }}>
        Refresh
      </button>
      <button type="button" disabled={disabled} onClick={async () => {
        await onQueue();
      }}>
        Queue one
      </button>
    </div>
  );
};

export const PlaybookLabControlPanel = ({ state, onRefresh, onQueue, onSeed }: Props) => {
  const stats = useMemo<readonly HeaderStat[]>(() => [
    { label: 'Campaigns', value: state.rows.length },
    { label: 'Seeded', value: state.seeded.length },
    { label: 'Alerts', value: state.alerts.length },
    { label: 'History', value: state.history.length },
  ], [state.alerts.length, state.history.length, state.rows.length, state.seeded.length]);

  const running = state.health.startsWith('fail');

  return (
    <section className="playbook-lab-control-panel">
      <h3>Playbook Lab Control</h3>
      <p>Tenant: {state.config.tenantId}</p>
      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
        ))}
      </div>
      <ActionList
        disabled={state.busy}
        onRefresh={onRefresh}
        onQueue={onQueue}
        onSeed={onSeed}
      />
      <p>{running ? 'busy' : state.health}</p>
    </section>
  );
};
