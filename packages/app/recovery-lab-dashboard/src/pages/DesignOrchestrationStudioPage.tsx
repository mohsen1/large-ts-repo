import { useState } from 'react';
import { useDesignStudioWorkspace } from '../hooks/useDesignStudioWorkspace';
import { designStudioService } from '../services/designStudioService';
import { DesignSignalPulsePanel } from '../components/DesignSignalPulsePanel';
import { DesignPluginMatrix } from '../components/DesignPluginMatrix';
import { DesignPolicyBoard } from '../components/DesignPolicyBoard';

interface DesignOrchestrationStudioPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

export const DesignOrchestrationStudioPage = ({ tenant, workspace }: DesignOrchestrationStudioPageProps) => {
  const { loading, workspace: workspaceState, refresh } = useDesignStudioWorkspace({ tenant, workspace });
  const [selectedPlan, setSelectedPlan] = useState('');

  const planId = selectedPlan || workspaceState.latestPlanId || 'seed-plan';
  const workspaceDigest = `${workspaceState.templates.length}/${workspaceState.scenarios.length}`;

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <h1>Design orchestration studio</h1>
      <p>
        tenant={tenant} workspace={workspace} templates={workspaceDigest} loading={loading ? 'yes' : 'no'}
      </p>
      <section style={{ display: 'grid', gap: 10 }}>
        <label htmlFor="plan-select">Plan</label>
        <select
          id="plan-select"
          value={selectedPlan}
          onChange={(event) => setSelectedPlan(event.currentTarget.value)}
        >
          <option value="">auto</option>
          {workspaceState.templates.map((entry) => (
            <option key={`${entry.templateId}`} value={entry.templateId}>
              {entry.templateId}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
        >
          refresh
        </button>
        <button
          type="button"
          onClick={() => {
            void designStudioService.runPlan(tenant, workspace, planId);
          }}
        >
          run-plan
        </button>
      </section>

      <DesignPluginMatrix tenant={tenant} workspace={workspace} planId={planId} />
      <DesignPolicyBoard tenant={tenant} workspace={workspace} />
      <DesignSignalPulsePanel tenant={tenant} workspace={workspace} metric="health" />
      <DesignSignalPulsePanel tenant={tenant} workspace={workspace} metric="risk" />

      <section>
        <h2>Scenario list</h2>
        <ul>
          {workspaceState.scenarios.map((scenario) => (
            <li key={String(scenario.scenarioId)}>{scenario.scenarioId}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Workspace events</h2>
        <pre>{JSON.stringify(workspaceState.eventLog, null, 2)}</pre>
      </section>
    </main>
  );
};
