import { useState } from 'react';
import { useRecoveryFabricWorkspace } from '../hooks/useRecoveryFabricWorkspace';
import { FabricNetworkGraph } from '../components/orchestration/FabricNetworkGraph';
import { FabricReadinessTimeline } from '../components/orchestration/FabricReadinessTimeline';
import { FabricCommandDeck } from '../components/orchestration/FabricCommandDeck';

export interface RecoveryFabricOrchestrationPageProps {
  readonly store: unknown;
}

export const RecoveryFabricOrchestrationPage = ({ store }: RecoveryFabricOrchestrationPageProps) => {
  const workspace = useRecoveryFabricWorkspace(store as any);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);

  const selectedPlan = workspace.selectedPlan ?? null;
  const selectedPolicy = workspace.policies.find((policy) => policy.id === workspace.selectedPolicyId) ?? null;

  return (
    <main className="recovery-fabric-orchestration-page">
      <header>
        <h1>Recovery Fabric Orchestration</h1>
        <p>
          Policies: {workspace.policies.length} · Plans: {workspace.plans.length} · Active runs: {workspace.activeRuns.length}
        </p>
      </header>

      <section className="recovery-fabric-controls">
        <button onClick={() => void workspace.refresh()}>Refresh</button>
        <button onClick={() => void workspace.runDigest()}>Build Digest</button>
        <button onClick={() => void workspace.summarizePlan()}>Summarize Plan</button>
      </section>

      <section className="selection">
        <label>
          Policy
          <select
            value={workspace.selectedPolicyId ?? ''}
            onChange={(event) => workspace.selectPolicy(event.target.value || null)}
          >
            <option value="">Unselected</option>
            {workspace.policies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Plan
          <select
            value={workspace.selectedPlanIndex ?? ''}
            onChange={(event) => {
              if (event.target.value === '') {
                workspace.selectPlan(null);
                return;
              }
              workspace.selectPlan(Number(event.target.value));
            }}
          >
            <option value="">Unselected</option>
            {workspace.plans.map((plan, index) => (
              <option key={plan.fabricId} value={index}>
                {plan.commands[0]?.name ?? `Plan ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="policy-summary">
        <h3>Policy Summary</h3>
        <p>{selectedPolicy ? `${selectedPolicy.name} (${selectedPolicy.riskTolerance})` : 'no policy selected'}</p>
      </section>

      <section className="plan-summary">
        <h3>Plan Summary</h3>
        <p>{selectedPlan ? `Top level command: ${selectedPlan.commands[0]?.name ?? 'none'}` : 'no plan selected'}</p>
        <p>Plan command count: {selectedPlan?.commands.length ?? 0}</p>
      </section>

      <section>
        <h3>Workspace Diagnostics</h3>
        <p>Run health: {workspace.runHealth}</p>
        <p>Last digest length: {workspace.lastDigest.length}</p>
      </section>

      <section>
        <h3>Warnings</h3>
        <ul>
          {workspace.warnings.map((warning, index) => (
            <li key={String(index)}>{warning}</li>
          ))}
        </ul>
      </section>

      <FabricCommandDeck
        commands={workspace.commandDeck}
        onHighlight={(commandId) => setSelectedCommandId(commandId)}
      />

      <FabricReadinessTimeline runs={workspace.activeRuns} plan={selectedPlan} />

      <FabricNetworkGraph
        plan={selectedPlan}
        selectedCommandId={selectedCommandId}
        onSelect={(commandId) => setSelectedCommandId(commandId)}
      />
    </main>
  );
};
