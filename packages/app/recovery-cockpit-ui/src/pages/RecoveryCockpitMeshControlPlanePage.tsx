import { useState } from 'react';
import { SignalMeshControlPlaneConsole } from '../components/mesh/SignalMeshControlPlaneConsole';
import { SignalMeshPolicyTimeline } from '../components/mesh/SignalMeshPolicyTimeline';
import { useMeshControlPlane } from '../hooks/useMeshControlPlane';

const SORT_LABEL = {
  asc: 'Lowest first',
  desc: 'Highest first',
} as const;

const formatMean = (values: readonly number[]): string =>
  values.length === 0 ? '0.0000' : Number(values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(4);

export const RecoveryCockpitMeshControlPlanePage = () => {
  const tenantId = 'tenant-mesh-control';
  const {
    loading,
    runs,
    errors,
    runCount,
    selectedRun,
    refresh,
    runScenario,
    setSelectedRun,
    clearErrors,
    toggleSort,
    laneSummary,
  } = useMeshControlPlane(tenantId);
  const [focus, setFocus] = useState<string | undefined>(undefined);

  const scores = runs.map((entry) => entry.score);
  const averageScore = formatMean(scores);
  const summaryPolicy = laneSummary.get('policy') ?? 0;
  const summarySignal = laneSummary.get('signal') ?? 0;

  return (
    <main className="recovery-cockpit-control-plane-page">
      <section>
        <h1>Recovery Cockpit Mesh Control Plane</h1>
        <p>{loading ? 'Loading scenarios...' : `Active runs: ${runCount}`}</p>
        <p>{`Average score: ${averageScore}`}</p>
        <p>{`Policy lanes: ${summaryPolicy} · Signal lanes: ${summarySignal}`}</p>
        <div className="mesh-control-plane-page__actions">
          <button type="button" onClick={() => void refresh()}>
            Refresh checks
          </button>
          <button type="button" onClick={toggleSort}>
            Toggle sort ({SORT_LABEL.asc})
          </button>
          <button type="button" onClick={() => void runScenario({ runId: tenantId, lane: 'policy', scenario: 'policy-sweep' })}>
            Run policy sweep
          </button>
          <button type="button" onClick={() => void runScenario({ runId: tenantId, lane: 'signal', scenario: 'signal-stress' })}>
            Run signal stress
          </button>
          <button type="button" onClick={() => void clearErrors()}>
            Clear errors
          </button>
        </div>
      </section>
      {errors.length > 0 && (
        <section className="mesh-control-plane-page__errors">
          {errors.map((entry) => (
            <p key={entry}>{entry}</p>
          ))}
        </section>
      )}
      <section className="mesh-control-plane-page__grid">
        {runs.map((run) => (
          <SignalMeshControlPlaneConsole
            key={run.runId}
            selected={run.runId === focus}
            result={run}
            onSelect={(runId) => setSelectedRun(runId)}
            onReplay={(runId) => {
              setFocus(runId);
              void runScenario({ runId, lane: run.lanes[0] ?? 'signal', scenario: 'replay' });
            }}
          />
        ))}
      </section>
      {selectedRun !== undefined ? (
        <section className="mesh-control-plane-page__timeline">
          <SignalMeshPolicyTimeline
            run={selectedRun}
            maxColumns={Math.max(2, Math.min(8, Math.ceil(scores.length || 1)))}
            onCellSelect={(bucket) => {
              setFocus(`${selectedRun.runId}:${bucket}`);
            }}
          />
        </section>
      ) : null}
    </main>
  );
};
