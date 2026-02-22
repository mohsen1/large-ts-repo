import { useRecoveryReadinessWorkspace } from '../hooks/useRecoveryReadinessWorkspace';
import { useRecoverySimulationWorkspace } from '../hooks/useRecoverySimulationWorkspace';
import { ReadinessForecastCard } from '../components/planning/ReadinessForecastCard';
import { IncidentHealthPalette } from '../components/planning/IncidentHealthPalette';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';

export const RecoveryReadinessConsolePage = ({ repository }: { repository: RecoveryIncidentRepository }) => {
  const readiness = useRecoveryReadinessWorkspace(repository);
  const simulation = useRecoverySimulationWorkspace(repository);

  return (
    <main className="recovery-readiness-console">
      <header>
        <h1>Recovery Readiness Console</h1>
        <button type="button" onClick={() => void readiness.actions.refresh()}>
          refresh readiness
        </button>
        <button type="button" onClick={() => void simulation.actions.refresh()}>
          refresh forecast
        </button>
      </header>
      <section>
        <IncidentHealthPalette
          title="Readiness snapshot"
          digest={{
            repositoryName: 'runtime-tenant-portfolio',
            tenantCount: readiness.state.metrics.length,
            unhealthyPlanCount: readiness.state.signals.length,
            summaryPlan: `${readiness.state.metrics.length} metrics`,
          }}
          onInspect={() => void readiness.actions.refresh()}
        />
      </section>
      <section>
        <ReadinessForecastCard
          label={`Simulation confidence ${(simulation.state.confidence * 100).toFixed(1)}%`}
          state={readiness.state}
          onTenant={(tenantId) => readiness.actions.selectTenant(tenantId)}
        />
      </section>
      <section>
        <dl>
          <dt>Top incident</dt>
          <dd>{simulation.state.topIncident}</dd>
          <dt>Runs</dt>
          <dd>{simulation.state.totalRuns}</dd>
          <dt>Projections</dt>
          <dd>{simulation.state.totalProjections}</dd>
          <dt>Envelope</dt>
          <dd>{simulation.state.envelopeText}</dd>
          <dt>Active</dt>
          <dd>{simulation.state.active ? 'yes' : 'no'}</dd>
        </dl>
      </section>
    </main>
  );
};
