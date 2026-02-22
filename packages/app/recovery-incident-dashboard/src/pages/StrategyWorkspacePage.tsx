import { useMemo, useState } from 'react';
import { useRecoveryStrategyOrchestrator } from '../hooks/useRecoveryStrategyOrchestrator';
import type { StrategyTemplate } from '@domain/recovery-orchestration-planning';
import { useStrategyPlanner } from '../hooks/useStrategyPlanner';

interface StrategyWorkspacePageProps {
  readonly tenantId: string;
  readonly template: StrategyTemplate;
}

export const StrategyWorkspacePage = ({ tenantId, template }: StrategyWorkspacePageProps) => {
  const [iterations, setIterations] = useState(3);
  const { state, actions } = useRecoveryStrategyOrchestrator(tenantId);
  const planner = useStrategyPlanner(template);

  const projectedMinutes = useMemo(() => {
    return planner.orderedSteps.reduce((sum, step) => sum + step.command.estimatedMinutes * iterations, 0);
  }, [planner.orderedSteps, iterations]);

  return (
    <main>
      <h1>Strategy Workspace</h1>
      <p>tenant={tenantId}</p>
      <p>template={template.templateId}</p>
      <p>iterations={iterations}</p>
      <p>projectedMinutes={projectedMinutes}</p>
      <p>state={state.loading ? 'loading' : 'ready'}</p>
      <p>plans={state.summary?.planCount ?? 0}</p>
      <p>runs={state.summary?.runCount ?? 0}</p>
      <input
        type="number"
        value={iterations}
        onChange={(event) => setIterations(Number(event.target.value))}
      />
      <button onClick={() => void actions.buildWorkspace(template)}>Rebuild workspace</button>
      <button onClick={() => void actions.startRun(template)}>Run workspace</button>
      {state.workspace ? <pre>{JSON.stringify(state.workspace.run, null, 2)}</pre> : null}
      {state.error ? <p style={{ color: 'red' }}>{state.error}</p> : null}
    </main>
  );
};
