import { type ReactElement } from 'react';
import { RecoveryLabConvergenceRuntimeConsole } from '../components/RecoveryLabConvergenceRuntimeConsole';
import { RecoveryLabConvergenceTracePanel } from '../components/RecoveryLabConvergenceTracePanel';
import { RecoveryLabManifestExplorer } from '../components/RecoveryLabManifestExplorer';
import { useRecoveryLabConvergenceRuntime } from '../hooks/useRecoveryLabConvergenceRuntime';
import { useMemo } from 'react';

export const RecoveryLabConvergenceRuntimePage = (): ReactElement => {
  const {
    state,
  } = useRecoveryLabConvergenceRuntime();

  const latest = useMemo(() => state.runs[state.runs.length - 1], [state.runs]);

  return (
    <article className="recovery-lab-convergence-runtime-page">
      <header>
        <h1>Recovery Lab Convergence Runtime</h1>
        <p>{state.tenantId}</p>
      </header>
      <RecoveryLabConvergenceRuntimeConsole
        tenantId={state.tenantId}
        onRunScope={() => {
          // hook-level orchestration is owner-driven; keep explicit callback stable for UI only.
        }}
      />
      <RecoveryLabManifestExplorer manifests={state.manifests} />
      {latest ? (
        <RecoveryLabConvergenceTracePanel
          runId={latest.runId}
          output={latest.output}
          events={latest.timeline}
        />
      ) : (
        <section>No runtime available</section>
      )}
    </article>
  );
};
