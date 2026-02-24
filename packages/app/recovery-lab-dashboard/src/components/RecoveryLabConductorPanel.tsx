import type { FC } from 'react';
import { useMemo } from 'react';
import { statusClass, type RecoveryLabConductorState } from '../hooks/useRecoveryLabConductor';

interface RecoveryLabConductorPanelProps {
  readonly tenant: string;
  readonly workspace: string;
  readonly state: RecoveryLabConductorState;
  readonly onRun: (event: string) => void;
}

const toMetricRows = (state: RecoveryLabConductorState) => {
  return [
    ['status', statusClass(state.status)],
    ['workspace', state.workspace?.workspace ?? 'none'],
    ['tenant', state.workspace?.tenant ?? 'none'],
    ['routes', state.routeSummary.length.toString()],
    ['summaries', state.summary?.summaries.length.toString() ?? '0'],
    ['top', state.summary?.top?.length.toString() ?? '0'],
  ];
};

const normalizeKey = (value: string): string => value.toUpperCase();

export const RecoveryLabConductorPanel: FC<RecoveryLabConductorPanelProps> = ({ tenant, workspace, state, onRun }) => {
  const metricRows = useMemo(() => toMetricRows(state), [state]);

  return (
    <section
      style={{
        border: '1px solid #d7d7d7',
        borderRadius: 8,
        padding: 12,
        display: 'grid',
        gap: 12,
      }}
    >
      <header>
        <h2>Recovery Lab Conductor</h2>
        <p>
          tenant={tenant} workspace={workspace} status={statusClass(state.status)}
        </p>
      </header>

      <article style={{ display: 'grid', gap: 6 }}>
        {metricRows.map(([name, value]) => {
          const key = `${name}:${value}`;
          return (
            <div
              key={key}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
              }}
            >
              <strong>{normalizeKey(name)}</strong>
              <span>{value}</span>
            </div>
          );
        })}
      </article>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onRun('manual')}>run-manual</button>
        <button type="button" onClick={() => onRun('seed')}>run-seed</button>
        <button type="button" onClick={() => onRun('replay')}>run-replay</button>
      </div>

      <section>
        <h3>Route summary</h3>
        <ul>
          {state.routeSummary.length === 0 ? <li>empty</li> : state.routeSummary.map((route) => <li key={route}>{route}</li>)}
        </ul>
      </section>
    </section>
  );
};
