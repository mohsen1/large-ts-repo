import { type ChangeEvent, type ReactElement, useMemo } from 'react';
import type { PluginOrchestratorState } from '../hooks/useRecoveryLabPluginOrchestrator';
import type { PluginKind } from '@domain/recovery-incident-lab-core';

export interface RecoveryLabPluginControlPanelProps {
  readonly state: PluginOrchestratorState;
  readonly seedKinds: readonly PluginKind[];
  readonly onRun: () => void;
  readonly onSelectKind: (kind: PluginKind) => void;
}

export const RecoveryLabPluginControlPanel = ({
  state,
  seedKinds,
  onRun,
  onSelectKind,
}: RecoveryLabPluginControlPanelProps): ReactElement => {
  const reportCount = state.reports.length;
  const hasPlan = Boolean(state.plan);
  const planSummary = useMemo(() => {
    if (!state.plan) {
      return 'no plan';
    }

    return `${state.plan.specs} specs, ${state.plan.edges} edges`;
  }, [state.plan]);

  const onChangeKind = (event: ChangeEvent<HTMLSelectElement>) => {
    onSelectKind((event.target.value as PluginKind) ?? state.selectedKind);
  };

  return (
    <section className="recovery-lab-plugin-control-panel">
      <header>
        <h2>Recovery Lab Plugin Orchestrator</h2>
      </header>
      <label>
        Kind:
        <select value={state.selectedKind} onChange={onChangeKind}>
          {seedKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      <div>Tenant: {state.tenantId}</div>
      <div>Namespace: {state.namespace}</div>
      <div>Status: {state.status}</div>
      <div>Plan: {planSummary}</div>
      <div>Reports: {reportCount}</div>
      <button type="button" onClick={onRun} disabled={!state.plan && state.status === 'running'}>
        {hasPlan ? 'Run Plan' : 'Build Plan'}
      </button>
    </section>
  );
};
