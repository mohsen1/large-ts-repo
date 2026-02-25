import { ChroniclePolicyComposer } from '../components/ChroniclePolicyComposer';
import { ChronicleRunConsole } from '../components/ChronicleRunConsole';
import { ChronicleTimelineStream } from '../components/ChronicleTimelineStream';
import { ChronicleWorkspacePanel } from '../components/ChronicleWorkspacePanel';
import { useChronicleOrchestrator } from '../hooks/useChronicleOrchestrator';

export const RecoveryChronicleOrchestratorPage = () => {
  const {
    policy,
    run,
    diagnostics,
    workspace,
    status,
    policyPatch,
    patchWorkspace,
    runOrchestratedPlan,
    warnings,
    outputScore,
    isRunning,
  } = useChronicleOrchestrator({
    tenant: 'tenant-global',
    planId: 'plan-global',
  });

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Recovery chronicle orchestrator</h1>
      <p>{`policy=${policy.id}`}</p>
      <p>{`outputs=${run?.output.length ?? 0}`}</p>
      <p>{`score=${outputScore.toFixed(2)}`}</p>
      <p>{`status=${status}`}</p>
      <button
        type="button"
        onClick={() => void runOrchestratedPlan()}
        disabled={isRunning || warnings.length > 0}
      >
        {isRunning ? 'running...' : 'run orchestration'}
      </button>
      {warnings.length > 0 ? <p>{warnings.join(', ')}</p> : null}
      <ChroniclePolicyComposer
        patch={policyPatch}
        disabled={isRunning}
        onPatchChange={patchWorkspace}
      />
      <ChronicleWorkspacePanel workspace={workspace} />
      <ChronicleTimelineStream outputs={run?.output ?? []} diagnostics={diagnostics} />
      <ChronicleRunConsole run={run} diagnostics={diagnostics} />
    </main>
  );
};
