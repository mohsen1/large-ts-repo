import { useMemo } from 'react';
import type { OrchestrationSuiteRunInput } from '../../services/orchestrationSuiteService';

interface OrchestrationSuiteControlProps {
  readonly input: Omit<OrchestrationSuiteRunInput, 'policies'>;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly onTenantChange: (tenant: string) => void;
  readonly onWorkspaceChange: (workspace: string) => void;
  readonly onScenarioChange: (scenario: string) => void;
  readonly onRepeatsChange: (repeats: number) => void;
  readonly onStart: () => void;
  readonly onQueue: () => void;
}

export const OrchestrationSuiteControl = ({
  input,
  loading,
  disabled,
  onTenantChange,
  onWorkspaceChange,
  onScenarioChange,
  onRepeatsChange,
  onStart,
  onQueue,
}: OrchestrationSuiteControlProps): React.JSX.Element => {
  const labels = useMemo(
    () => `${input.tenant}/${input.workspace}/${input.scenario}`.toUpperCase(),
    [input],
  );

  return (
    <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
      <h3>Suite control</h3>
      <p>{labels}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <label>
          Tenant
          <input
            type="text"
            value={input.tenant}
            onChange={(event) => onTenantChange(event.target.value)}
            disabled={loading}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Workspace
          <input
            type="text"
            value={input.workspace}
            onChange={(event) => onWorkspaceChange(event.target.value)}
            disabled={loading}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Scenario
          <input
            type="text"
            value={input.scenario}
            onChange={(event) => onScenarioChange(event.target.value)}
            disabled={loading}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Repeats
          <input
            type="number"
            min={1}
            max={12}
            value={input.repeats}
            onChange={(event) => onRepeatsChange(Number.parseInt(event.target.value, 10))}
            disabled={loading}
            style={{ width: '120px' }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button type="button" disabled={disabled || loading} onClick={onStart}>
          {loading ? 'running' : 'run'}
        </button>
        <button type="button" disabled={loading} onClick={onQueue}>
          queue-batch
        </button>
      </div>
    </section>
  );
};
