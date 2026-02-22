import { useMemo } from 'react';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { SignalRepository } from '@data/incident-signal-store';
import { useIncidentAnalytics } from '../hooks/useIncidentAnalytics';
import { AnalyticsKpiPanel } from '../components/analytics/AnalyticsKpiPanel';
import { IncidentTrendBoard } from '../components/analytics/IncidentTrendBoard';

export interface AnalyticsConsolePageProps {
  readonly incidentRepository: RecoveryIncidentRepository;
  readonly signalRepository: SignalRepository;
}

export const AnalyticsConsolePage = ({ incidentRepository, signalRepository }: AnalyticsConsolePageProps) => {
  const {
    snapshot,
    loading,
    kpis,
    projections,
    recommendations,
    refresh,
    runForFirstIncident,
  } = useIncidentAnalytics(incidentRepository, signalRepository);

  const actionRows = useMemo(
    () => recommendations.map((item) => (
      `${item.band.toUpperCase()} ${item.id}: ${item.confidence.toFixed(2)} (${item.actionCount} actions)`
    )),
    [recommendations],
  );

  return (
    <main className="analytics-console-page">
      <header>
        <h1>Recovery Analytics Console</h1>
        <button onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Analytics'}
        </button>
        <button onClick={() => { void runForFirstIncident(); }}>
          Warm Start First Incident
        </button>
      </header>
      {kpis ? (
        <AnalyticsKpiPanel
          tenantId={kpis.tenantId}
          totalSignals={kpis.totalSignals}
          alertScore={kpis.alertScore}
          recommendationCount={kpis.recommendationCount}
          criticalAlerts={kpis.criticalAlerts}
        />
      ) : null}
      {snapshot ? (
        <section>
          <h2>Recommended Actions</h2>
          <ul>
            {actionRows.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <IncidentTrendBoard tenantId={snapshot.tenantId as string} rows={projections} />
        </section>
      ) : null}
    </main>
  );
};
