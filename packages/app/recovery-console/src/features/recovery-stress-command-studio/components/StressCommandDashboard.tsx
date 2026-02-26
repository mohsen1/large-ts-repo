import { memo, useMemo } from 'react';
import type {
  RouteCommand,
  StressStudioBuckets,
  StressStudioRuntimeState,
  StressStudioResult,
  StressCommandMode,
} from '../types';

interface StressCommandDashboardProps {
  readonly state: StressStudioRuntimeState;
  readonly commands: readonly RouteCommand[];
  readonly buckets: StressStudioBuckets;
  readonly results: readonly StressStudioResult[];
  readonly mode: StressCommandMode;
  readonly onRun: () => Promise<void>;
  readonly onRefresh: () => void;
}

const resultByMode = (mode: StressCommandMode, results: readonly StressStudioResult[]) => {
  const count = results.filter((result) => result.message.includes(mode)).length;
  return {
    label: mode,
    total: results.length,
    matched: count,
  };
};

const SeverityBadge = memo(({ kind, value }: { readonly kind: string; readonly value: number }) => {
  const color = value > 20 ? 'crimson' : value > 5 ? 'orange' : 'forestgreen';
  return (
    <span style={{ color, fontWeight: 'bold' }}>
      {kind}: {value}
    </span>
  );
});

export const StressCommandDashboard = ({
  state,
  commands,
  buckets,
  results,
  mode,
  onRun,
  onRefresh,
}: StressCommandDashboardProps) => {
  const totalPriority = useMemo(
    () => commands.reduce((acc, command) => acc + command.priority, 0),
    [commands],
  );

  const low = buckets.low_bucket.length;
  const medium = buckets.medium_bucket.length;
  const high = buckets.high_bucket.length;
  const urgent = buckets.urgent_bucket.length;
  const modeMetric = useMemo(() => resultByMode(mode, results), [mode, results]);

  const rows = useMemo(
    () =>
      commands
        .slice(0, 12)
        .map((command) => ({
          id: command.id,
          route: command.route,
          priority: command.priority,
          mode: command.mode,
        })),
    [commands],
  );

  const trace = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const result of results) {
      const key = result.status;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    return Array.from(grouped.entries()).map(([status, count]) => ({
      status,
      count,
    }));
  }, [results]);

  return (
    <section>
      <h2>Stress Command Dashboard</h2>
      <p>Tenant: {state.tenant}</p>
      <p>Run: {state.runId}</p>
      <p>Mode: {modeMetric.label}</p>
      <p>Refresh token: {state.refreshToken}</p>
      <p>Command count: {commands.length}</p>
      <p>Average priority: {commands.length ? (totalPriority / commands.length).toFixed(2) : '0'}</p>
      <p>
        <SeverityBadge kind="low" value={low} />
        {' / '}
        <SeverityBadge kind="medium" value={medium} />
        {' / '}
        <SeverityBadge kind="high" value={high} />
        {' / '}
        <SeverityBadge kind="urgent" value={urgent} />
      </p>
      <p>Result mode match: {modeMetric.matched} of {modeMetric.total}</p>
      <section>
        <h3>Controls</h3>
        <button type="button" onClick={onRun} disabled={state.running}>
          {state.running ? 'Running...' : 'Run'}
        </button>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
      </section>
      <section>
        <h3>Command rows</h3>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Route</th>
              <th>Mode</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((command) => (
              <tr key={command.id}>
                <td>{command.id}</td>
                <td>{command.route}</td>
                <td>{command.mode}</td>
                <td>{command.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3>Result trace</h3>
        <ul>
          {trace.map((entry) => (
            <li key={entry.status}>
              {entry.status}: {entry.count}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
