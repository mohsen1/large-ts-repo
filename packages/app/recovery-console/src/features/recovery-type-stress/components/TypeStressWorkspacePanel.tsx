import { type ReactElement, useMemo } from 'react';
import { useRecoveryTypeStressWorkspace } from '../hooks/useRecoveryTypeStressWorkspace';
import { TypeStressRouteMatrix } from './TypeStressRouteMatrix';

interface Props {
  readonly tenant: string;
}

export const TypeStressWorkspacePanel = ({ tenant }: Props): ReactElement => {
  const { state, busy, error, summary, refresh } = useRecoveryTypeStressWorkspace(tenant);

  const banner = useMemo(() => {
    if (!state) {
      return 'No workspace loaded';
    }

    const counts = state.records.reduce<Record<string, number>>((acc, record) => {
      acc[record.kind] = (acc[record.kind] ?? 0) + 1;
      return acc;
    }, {});

    return `${summary.size} records | kinds=${summary.uniqueKinds} | score=${summary.score ?? 0} | ` +
      `critical=${counts['catalog'] ?? 0}/${counts['resolver'] ?? 0}/${counts['workflow'] ?? 0}`;
  }, [state, summary]);

  return (
    <section className="type-stress-workspace-panel">
      <header>
        <h2>Type Stress Workspace</h2>
        <p>Tenant: {tenant}</p>
        {error ? <p className="error">{error}</p> : null}
        <p>{banner}</p>
      </header>
      <button type="button" onClick={() => void refresh()} disabled={busy}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </button>
      <TypeStressRouteMatrix workspace={state} />
    </section>
  );
};
