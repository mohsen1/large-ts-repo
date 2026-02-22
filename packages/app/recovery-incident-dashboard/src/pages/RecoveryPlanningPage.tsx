import { useMemo } from 'react';
import { useRecoveryPlanningWorkspace } from '../hooks/useRecoveryPlanningWorkspace';
import { useRecoveryReadinessWorkspace } from '../hooks/useRecoveryReadinessWorkspace';
import { IncidentHealthPalette } from '../components/planning/IncidentHealthPalette';
import { PlanMatrixBoard } from '../components/planning/PlanMatrixBoard';
import { ReadinessForecastCard } from '../components/planning/ReadinessForecastCard';
import { RunVelocityTimeline } from '../components/planning/RunVelocityTimeline';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';

export const RecoveryPlanningPage = ({ repository }: { repository: RecoveryIncidentRepository }) => {
  const planning = useRecoveryPlanningWorkspace(repository);
  const readiness = useRecoveryReadinessWorkspace(repository);

  const points = useMemo(() => planning.state.lanes.slice(0, 8).map((lane) => ({
    timestamp: new Date().toISOString(),
    value: lane.signalDensity,
  })), [planning.state.lanes]);

  return (
    <main className="recovery-planning-page">
      <header>
        <h1>Recovery Planning Console</h1>
        <button type="button" onClick={() => void planning.actions.refresh()}>
          refresh plans
        </button>
      </header>
      <section>
        <IncidentHealthPalette
          title="Portfolio health"
          digest={planning.state.portfolioDigest}
          onInspect={() => void readiness.actions.refresh()}
        />
      </section>
      <section>
        <PlanMatrixBoard
          title="Active plan matrix"
          lanes={planning.state.lanes}
          onSelectPlan={(planId) => void planning.actions.loadIncident(String(planId))}
        />
      </section>
      <section>
        <ReadinessForecastCard
          label="Tenant readiness"
          state={readiness.state}
          onTenant={(tenantId) => readiness.actions.selectTenant(tenantId)}
        />
      </section>
      <section>
        <RunVelocityTimeline title="Signal flow" points={points} baseline={0.5} />
      </section>
    </main>
  );
};
