import { FC, useMemo, useState } from 'react';
import { CadenceOverviewPanel } from '../components/cadence/CadenceOverviewPanel';
import { CadenceTimeline } from '../components/cadence/CadenceTimeline';
import { CadenceReadinessBoard } from '../components/cadence/CadenceReadinessBoard';
import { CadenceExecutionLog } from '../components/cadence/CadenceExecutionLog';
import { CadenceReadinessDashboard } from '../components/cadence/CadenceReadinessDashboard';
import { CadenceExecutionConsole } from '../components/cadence/CadenceExecutionConsole';
import { useCadenceSignals } from '../hooks/useCadenceSignals';
import { useCadenceOrchestrator } from '../hooks/useCadenceOrchestrator';
import { withBrand } from '@shared/core';
import type { RecoveryRunState } from '@domain/recovery-orchestration';

export const CadenceOperationsWorkspacePage: FC = () => {
  const {
    plans,
    candidates,
    addRun,
    executePlan,
    events,
    workspace,
    setSelectedCandidateId,
    selectedCandidateId,
  } = useCadenceOrchestrator();

  const [runId, setRunId] = useState('run-001');
  const [planId, setPlanId] = useState('');
  const [slotId, setSlotId] = useState('');

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === planId) ?? plans[0], [planId, plans]);

  const runSeed: RecoveryRunState = useMemo(
    () => ({
      runId: withBrand(runId, 'RecoveryRunId'),
      programId: withBrand(`program-${runId}`, 'RecoveryProgramId'),
      incidentId: withBrand(`incident-${runId}`, 'RecoveryIncidentId'),
      status: 'staging',
      startedAt: new Date().toISOString(),
      estimatedRecoveryTimeMinutes: 42,
    }),
    [runId],
  );

  const selectedReadiness = selectedCandidateId || candidates[0]?.profile.programRun;

  const candidateByProgram = useMemo(
    () => candidates.find((candidate) => candidate.profile.programRun === selectedReadiness),
    [selectedReadiness, candidates],
  );

  const cadenceSignals = useCadenceSignals({
    candidates,
    plans,
    selectedPlanId: selectedPlan?.id,
  });

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Recovery Cadence Operations Lab</h1>
      <section style={{ display: 'grid', gap: 8, border: '1px solid #cbd5e1', padding: 12, borderRadius: 8 }}>
        <h2>Run controls</h2>
        <p>Current run id: {runId}</p>
        <label htmlFor="run-id">Run identifier</label>
        <input id="run-id" value={runId} onChange={(event) => setRunId(event.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void addRun(runSeed)}>Generate candidate + plan</button>
          <button
            type="button"
            onClick={() =>
              void addRun({
                runId: withBrand(runId, 'RecoveryRunId'),
                programId: withBrand(`program-${runId}`, 'RecoveryProgramId'),
                incidentId: withBrand(`incident-${runId}`, 'RecoveryIncidentId'),
                status: 'completed',
                estimatedRecoveryTimeMinutes: 20,
              })
            }
          >
            Re-seed with completed run
          </button>
        </div>
        <h3>Workspace stats</h3>
        <p>Total candidates: {candidates.length}</p>
        <p>Total plans: {plans.length}</p>
        <p>Last events: {events.length}</p>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <CadenceOverviewPanel
          plans={plans}
          selectedPlanId={planId}
          onSelect={setPlanId}
          onExecute={(selectedPlanId) => {
            const plan = plans.find((entry) => entry.id === selectedPlanId);
            if (!plan) return;
            setPlanId(plan.id);
            void executePlan(plan);
          }}
          onRefresh={() => {
            void addRun(runSeed);
          }}
        />

        <CadenceTimeline plan={selectedPlan ?? null} onSlotSelect={setSlotId} />

        <CadenceReadinessBoard
          candidates={candidates}
          selectedCandidateId={selectedCandidateId}
          onCandidateSelect={(id) => {
            setSelectedCandidateId(id);
          }}
        />

        <CadenceExecutionLog
          plans={plans}
          candidatesCount={candidates.length}
          workspaceLog={events}
          selectedPlanId={selectedPlan?.id ?? ''}
          onPlanSelect={setPlanId}
        />

        <CadenceReadinessDashboard
          candidates={candidates}
          selectedCandidateId={selectedReadiness || ''}
          onSelect={setSelectedCandidateId}
          onRefresh={() => {
            void addRun(runSeed);
          }}
        />

        <CadenceExecutionConsole
          candidates={candidates}
          selectedCandidate={candidateByProgram ?? null}
          signalDensity={cadenceSignals.signalDensity}
          topConstraintSignals={cadenceSignals.candidateConstraintSignals}
          planDensityById={cadenceSignals.planDensityById}
        />
      </section>

      <section style={{ border: '1px solid #cbd5e1', padding: 12, borderRadius: 8 }}>
        <h2>{selectedPlan ? `Timeline for ${selectedPlan.id}` : 'Select a plan to inspect'}</h2>
        <p>Latest selected slot: {slotId || 'none'}</p>
        <p>Selected candidate: {selectedReadiness || 'none'}</p>
        <p>Selected plan created at: {selectedPlan?.createdAt}</p>
        <h3>Workspace snapshot</h3>
        <ul>
          <li>Orchestrator plans cached: {workspace.plans.length}</li>
          <li>Audit entries: {workspace.audit.length}</li>
          <li>Candidate run window: {candidateByProgram ? candidateByProgram.profile.windows.length : 0}</li>
          <li>Candidate notes: {candidateByProgram ? candidateByProgram.notes.length : 0}</li>
          <li>Plan windows: {selectedPlan?.windows.length ?? 0}</li>
          <li>Selected risk score: {selectedPlan?.readinessScore ?? 'n/a'}</li>
        </ul>
      </section>
    </main>
  );
};
