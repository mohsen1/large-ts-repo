import { useMemo, useState } from 'react';
import { RecoverySyntheticOrchestrator, defaultOrchestrator } from '@service/recovery-synthetic-orchestrator';
import { useRecoverySyntheticOrchestrationWorkspace } from '../hooks/useRecoverySyntheticOrchestrationWorkspace';

interface StrategyState {
  readonly enabled: boolean;
  readonly maxRuns: number;
}

export const RecoverySyntheticStrategyControlPage = () => {
  const [formState, setFormState] = useState<StrategyState>({
    enabled: true,
    maxRuns: 4,
  });
  const workspace = useRecoverySyntheticOrchestrationWorkspace({
    tenantId: 'tenant-synthetic',
    workspaceId: 'workspace-strategy',
    initial: {
      maxRuns: formState.maxRuns,
      pluginDefinitions: defaultOrchestrator()['plugins'] as any,
    },
  });

  const status = useMemo(() => (formState.enabled ? 'enabled' : 'disabled'), [formState.enabled]);

  return (
    <main>
      <h1>Recovery Synthetic Strategy Control</h1>
      <p>{`Strategy status: ${status}`}</p>
      <label>
        Max Runs
        <input
          type="number"
          value={formState.maxRuns}
          onChange={(event) => {
            setFormState((prev) => ({
              ...prev,
              maxRuns: Number(event.target.value),
            }));
          }}
        />
      </label>
      <label>
        Enabled
        <input
          type="checkbox"
          checked={formState.enabled}
          onChange={(event) => {
            setFormState((prev) => ({
              ...prev,
              enabled: event.target.checked,
            }));
          }}
        />
      </label>
      <section>
        <button
          type="button"
          onClick={() => {
            if (!formState.enabled) return;
            void workspace.actions.runOnce('tenant-synthetic', 'workspace-strategy');
          }}
          disabled={!formState.enabled}
        >
          Run strategy
        </button>
        <button
          type="button"
          onClick={() => void workspace.actions.refresh()}
        >
          Refresh strategy state
        </button>
      </section>
      <section>
        <h4>Recent synthetic runs</h4>
        <ul>
          {workspace.runs.slice(0, 10).map((run) => (
            <li key={run.runId}>{`${run.runId} - ${run.status} - warnings:${run.warnings.length}`}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
