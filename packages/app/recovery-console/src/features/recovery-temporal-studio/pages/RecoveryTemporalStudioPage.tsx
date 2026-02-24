import { useState } from 'react';
import { TemporalPlanBoard } from '../components/TemporalPlanBoard';
import { TemporalTimelineChart } from '../components/TemporalTimelineChart';
import { type TemporalStudioMode, formatTenant } from '../types';
import { useRecoveryTemporalStudio } from '../hooks/useRecoveryTemporalStudio';

export const RecoveryTemporalStudioPage = () => {
  const [tenant, setTenant] = useState('tenant-alpha');
  const [planName, setPlanName] = useState('studio-primary');
  const [candidates, setCandidates] = useState('alpha,beta,gamma');
  const { state, hydrate, runPlan, setMode, setSelectedRun, diagnostics, rowsView } = useRecoveryTemporalStudio();

  return (
    <main style={{ padding: '1.2rem', color: '#e2e8f0' }}>
      <header style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <section
          style={{
            border: '1px solid #334155',
            borderRadius: '0.55rem',
            padding: '0.85rem',
            background: '#0f172a',
            flex: 1,
            minWidth: 260,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Recovery Temporal Orchestrator</h2>
          <p style={{ color: '#94a3b8', marginBottom: '0.75rem' }}>
            Build and run high-fidelity temporal plans with plugin sequencing, signals and observability.
          </p>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Tenant
            <input
              value={tenant}
              onChange={(event) => {
                setTenant(event.target.value);
              }}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Plan name
            <input
              value={planName}
              onChange={(event) => {
                setPlanName(event.target.value);
              }}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Candidates
            <input
              value={candidates}
              onChange={(event) => {
                setCandidates(event.target.value);
              }}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                void hydrate(formatTenant(tenant));
              }}
            >
              Load Diagnostics
            </button>
            <button
              type="button"
              onClick={() => {
                void runPlan({
                  tenant: formatTenant(tenant),
                  actor: 'ops-console',
                  candidateNames: candidates
                    .split(',')
                    .map((candidate) => candidate.trim())
                    .filter(Boolean),
                  planName,
                });
              }}
            >
              Execute Plan
            </button>
          </div>
          <p style={{ margin: 0, marginTop: '0.5rem', color: '#94a3b8' }}>
            diagnostics: runs={diagnostics.runCount} hasData={String(diagnostics.hasData)}
          </p>
        </section>

        <section
          style={{
            border: '1px solid #334155',
            borderRadius: '0.55rem',
            padding: '0.85rem',
            background: '#0f172a',
            flex: 1,
            minWidth: 260,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Execution summary</h3>
          <p>Tenant: {tenant}</p>
          <p>Mode: {state.mode}</p>
          <p>Status: {state.loading ? 'loading' : 'ready'}</p>
          <p>Rows: {rowsView.length}</p>
          <p>Timeline stages: {state.timeline.length}</p>
          <p>Mode rank: {state.mode.length}</p>
          <p>Last selected: {state.selectedRun ? String(state.selectedRun) : 'none'}</p>
        </section>
      </header>

      <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <TemporalPlanBoard
          state={state}
          onModeChange={(mode: TemporalStudioMode) => {
            setMode(mode);
          }}
          onSelect={(runId) => {
            setSelectedRun(runId);
          }}
        />
        <TemporalTimelineChart mode={state.mode} entries={state.timeline} selected={state.selectedRun} />
      </section>
    </main>
  );
};

export default RecoveryTemporalStudioPage;
