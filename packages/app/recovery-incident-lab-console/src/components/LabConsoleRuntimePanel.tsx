import { type ChangeEvent, useMemo, useState, type ReactElement } from 'react';
import { useRecoveryLabConsoleRuntime } from '../hooks/useRecoveryLabConsoleRuntime';
import type { IncidentLabScenario, IncidentLabPlan } from '@domain/recovery-incident-lab-core';

const defaultScenario: IncidentLabScenario = {
  id: 'runtime-scenario-alpha' as IncidentLabScenario['id'],
  labId: 'incident-lab' as IncidentLabScenario['labId'],
  name: 'Runtime stress scenario',
  createdBy: 'ts-stress',
  severity: 'critical',
  topologyTags: ['topology', 'runtime'],
  steps: [
    {
      id: 'runtime-step-1' as IncidentLabScenario['steps'][number]['id'],
      label: 'collect telemetry',
      command: 'snapshot',
      expectedDurationMinutes: 1,
      dependencies: [],
      constraints: [{ key: 'latency', operator: 'lt', value: 80 }],
      owner: 'run-owner' as IncidentLabScenario['steps'][number]['owner'],
    },
  ],
  estimatedRecoveryMinutes: 3,
  owner: 'incident-lab-core',
  labels: ['runtime', 'console'],
};

const defaultPlan: IncidentLabPlan = {
  id: 'runtime-plan-alpha' as IncidentLabPlan['id'],
  scenarioId: defaultScenario.id,
  labId: defaultScenario.labId,
  selected: ['runtime-step-1' as IncidentLabPlan['selected'][number]],
  queue: ['runtime-step-1' as IncidentLabPlan['selected'][number]],
  state: 'ready',
  orderedAt: new Date().toISOString(),
  scheduledBy: 'planner',
};

export const LabConsoleRuntimePanel = (): ReactElement => {
  const { launch, status, state, restart, canRestart } = useRecoveryLabConsoleRuntime();
  const [tenantId, setTenantId] = useState('tenant-runtime');
  const [workspace, setWorkspace] = useState('workspace-runtime');

  const summary = useMemo(() => {
    if (state.mode === 'ready') {
      return 'no run executed';
    }
    if (state.mode === 'running') {
      return `running @ ${tenantId}/${workspace}`;
    }
    if (state.mode === 'error') {
      return `error: ${state.error ?? 'unknown'}`;
    }
    return `complete for ${tenantId}`;
  }, [state.error, state.mode, tenantId, workspace]);

  const onTenantChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTenantId(event.target.value);
  };

  const onWorkspaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWorkspace(event.target.value);
  };

  const execute = async () => {
    await launch(defaultScenario, defaultPlan, tenantId, workspace);
  };

  return (
    <section className="lab-console-runtime-panel">
      <h2>Lab Console Runtime Panel</h2>
      <p>{summary}</p>
      <p>{status}</p>
      <label htmlFor="tenant-id">Tenant</label>
      <input id="tenant-id" value={tenantId} onChange={onTenantChange} />
      <label htmlFor="workspace-id">Workspace</label>
      <input id="workspace-id" value={workspace} onChange={onWorkspaceChange} />
      <div>
        <button onClick={execute} type="button" disabled={state.mode === 'running'}>
          Run runtime
        </button>
        <button onClick={restart} type="button" disabled={!canRestart || state.mode === 'running'}>
          Retry
        </button>
      </div>
      <pre>{JSON.stringify({ tenantId, workspace, pluginCount: state.pluginCount }, null, 2)}</pre>
    </section>
  );
};
