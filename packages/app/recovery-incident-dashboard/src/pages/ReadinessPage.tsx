import { useIncidentReadiness } from '../hooks/useIncidentReadiness';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { ReadinessOverview } from '../components/ReadinessOverview';
import { useMemo } from 'react';

export const ReadinessPage = ({ repository }: { repository: RecoveryIncidentRepository }) => {
  const {
    state,
    loadAll,
    runTenant,
    runAutoCheck,
    selectTenant,
    selectedWindow,
    readyRatio,
  } = useIncidentReadiness(repository);

  const selectedIncidentFamilies = useMemo(() => {
    const source = selectedWindow?.familyCounts ?? {};
    return Object.entries(source)
      .map(([family, count]) => ({ family, count }))
      .sort((left, right) => right.count - left.count);
  }, [selectedWindow]);

  const topReason = selectedWindow?.snapshots
    .flatMap((snapshot) => snapshot.evidence.map((entry) => entry.reasons))
    .flat()
    .at(0);

  return (
    <main className="readiness-page">
      <header>
        <h1>Readiness and Recovery Readiness</h1>
        <p>Global readiness ratio: {Math.round(readyRatio * 100)}%</p>
      </header>
      <section>
        <button onClick={() => void loadAll()}>Reload Portfolio Readiness</button>
      </section>
      <section className="readiness-states">
        <ReadinessOverview
          windows={state.tenantReadiness}
          selectedTenant={selectedWindow?.tenantId}
          onSelectTenant={selectTenant}
        />
        <article>
          <h2>Tenant Action Center</h2>
          <p>Status: {state.status}</p>
          <p>
            tenants: {state.tenantReadiness.length}
          </p>
          <ul>
            {state.tenantReadiness.map((tenant) => (
              <li key={tenant.tenantId}>
                <strong>{tenant.tenantId}</strong>
                <button
                  onClick={() => void runTenant(tenant.tenantId)}
                >
                  Refresh
                </button>
                <button
                  onClick={() => {
                    void runAutoCheck(tenant.tenantId).then((check) => {
                      if (!check.ready) {
                        window.alert(`drill required for ${tenant.tenantId}: ${check.reason}`);
                      }
                    });
                  }}
                >
                  Auto Check
                </button>
              </li>
            ))}
          </ul>
          {selectedWindow && (
            <article>
              <h3>{selectedWindow.tenantId} details</h3>
              <p>Rollups: {selectedWindow.rollups.length}</p>
              <p>Resolved trend points: {state.profile?.tenantSeries.find((entry) => entry.tenantId === selectedWindow.tenantId)?.velocity.length ?? 0}</p>
              <p>Top reason: {topReason ?? 'n/a'}</p>
              <ul>
                {selectedIncidentFamilies.map((entry) => (
                  <li key={entry.family}>
                    {entry.family}: {entry.count}
                  </li>
                ))}
              </ul>
            </article>
          )}
        </article>
      </section>
      <footer>
        {state.errors.length > 0 && (
          <ul>
            {state.errors.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        )}
      </footer>
    </main>
  );
};
