import { useMemo, useState } from 'react';
import { StudioMode } from '../models/policy-studio-types';
import { UsePolicyStudioOrchestrationActions, UsePolicyStudioOrchestrationState } from '../hooks/usePolicyStudioOrchestration';
import { PolicyTopologyBoard } from './PolicyTopologyBoard';
import { PolicyScenarioComposer } from './PolicyScenarioComposer';

interface PolicyCommandCenterProps {
  readonly state: UsePolicyStudioOrchestrationState;
  readonly controls: UsePolicyStudioOrchestrationActions;
}

export const PolicyCommandCenter = ({ state, controls }: PolicyCommandCenterProps) => {
  const [mode, setMode] = useState<StudioMode>('observe');
  const commandLine = useMemo(() => {
    const traces = state.workspace.traces.map((trace) => `${trace.commandId}:${trace.message}`);
    return traces.length > 0 ? traces.join(' | ') : 'no traces yet';
  }, [state.workspace.traces]);

  const onRunTemplates = async (templateIds: readonly string[], dryRun: boolean): Promise<void> => {
    await controls.runTemplates(templateIds, dryRun);
    await controls.refresh();
  };

  return (
    <section>
      <h1>Policy Command Center</h1>
      <p>orchestrator={state.workspace.orchestratorId}</p>
      <div style={{ marginBottom: '1rem' }}>
        <label>
          <input type="radio" checked={mode === 'observe'} onChange={() => setMode('observe')} />
          Observe
        </label>
        <label>
          <input type="radio" checked={mode === 'design'} onChange={() => setMode('design')} />
          Design
        </label>
        <label>
          <input type="radio" checked={mode === 'simulate'} onChange={() => setMode('simulate')} />
          Simulate
        </label>
        <label>
          <input type="radio" checked={mode === 'execute'} onChange={() => setMode('execute')} />
          Execute
        </label>
      </div>
      <button type="button" onClick={() => controls.setMode(mode)}>
        Apply mode {mode}
      </button>
      <button type="button" style={{ marginLeft: '0.5rem' }} onClick={() => void controls.refresh()}>
        Refresh
      </button>
      <button
        type="button"
        style={{ marginLeft: '0.5rem' }}
        onClick={() => controls.runTemplates([], true)}
        disabled={state.templates.length === 0}
      >
        Warm run
      </button>
      <p style={{ marginTop: '1rem' }}><strong>Commands</strong>: {commandLine}</p>
      <PolicyScenarioComposer templates={state.templates} mode={mode} onSubmit={onRunTemplates} />
      <PolicyTopologyBoard
        topology={state.topology}
        selectedNodeIds={state.workspace.selectedNodeIds}
        onNodeToggle={(nodeId) => controls.toggleNodeSelection(nodeId)}
        onSelectGroup={(section) => controls.setQuery(String(section))}
      />
      <section>
        <h3>Telemetry</h3>
        <ul>
          {state.telemetryPoints.slice(0, 8).map((point) => (
            <li key={`${point.runId}-${point.key}`}>
              {point.key} = {point.value}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};

