import { type ReactElement } from 'react';

interface PlannerToolbarProps {
  readonly namespace: string;
  readonly loading: boolean;
  readonly onRun: () => void;
  readonly onRefresh: () => void;
  readonly onExport: () => void;
}

export const PlannerToolbar = ({
  namespace,
  loading,
  onRun,
  onRefresh,
  onExport,
}: PlannerToolbarProps): ReactElement => {
  const label = loading ? 'running...' : 'idle';

  return (
    <section className="planner-toolbar">
      <h3>Planner</h3>
      <p>Workspace: {namespace}</p>
      <p>Status: {label}</p>
      <div>
        <button type="button" onClick={onRun} disabled={loading}>
          Run topology
        </button>
        <button type="button" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
        <button type="button" onClick={onExport} disabled={loading}>
          Export
        </button>
      </div>
    </section>
  );
};
