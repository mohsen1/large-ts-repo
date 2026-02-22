import { ChangeEvent, FormEvent } from 'react';
import type { AdaptivePolicy } from '@domain/adaptive-ops';
import { AdaptiveOpsRunFilter } from '../hooks/useAdaptiveOpsDashboard';

interface RunControlsProps {
  policies: readonly AdaptivePolicy[];
  selectedPolicies: readonly AdaptivePolicy[];
  filter: AdaptiveOpsRunFilter;
  running: boolean;
  onTogglePolicy(policyId: string): void;
  onWindowChange(value: number): void;
  onMaxActionsChange(value: number): void;
  onDryRunChange(value: boolean): void;
  onExecute(): void;
}

const formatMsLabel = (value: number): string => `${Math.round(value / 1000)}s`;

export const RunControls = ({
  policies,
  selectedPolicies,
  filter,
  running,
  onTogglePolicy,
  onWindowChange,
  onMaxActionsChange,
  onDryRunChange,
  onExecute,
}: RunControlsProps) => {
  const selectedSet = new Set(selectedPolicies.map((policy) => policy.id));
  const policyOptions = policies.map((policy) => (
    <label key={policy.id} className="policy-row">
      <input
        type="checkbox"
        checked={selectedSet.has(policy.id)}
        onChange={() => {
          onTogglePolicy(policy.id);
        }}
      />
      <span>{policy.name}</span>
    </label>
  ));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onExecute();
  };

  const onWindowInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onWindowChange(Math.max(10_000, Math.floor(next)));
  };

  const onActionInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onMaxActionsChange(Math.max(1, Math.min(20, Math.floor(next))));
  };

  const onDryRunToggle = (event: ChangeEvent<HTMLInputElement>) => onDryRunChange(event.target.checked);

  return (
    <form className="run-controls" onSubmit={onSubmit}>
      <fieldset>
        <legend>Execution Controls</legend>
        <label>
          Window (ms):
          <input type="range" min={10_000} max={600_000} value={filter.windowMs} onChange={onWindowInput} />
          <span>{formatMsLabel(filter.windowMs)}</span>
        </label>
        <label>
          Max actions:
          <input type="number" min={1} max={20} value={filter.maxActions} onChange={onActionInput} />
        </label>
        <label>
          <input type="checkbox" checked={filter.dryRun} onChange={onDryRunToggle} />
          Dry run only
        </label>
      </fieldset>
      <fieldset>
        <legend>Policies</legend>
        {policyOptions}
      </fieldset>
      <button type="submit" disabled={running}>
        {running ? 'Running...' : 'Run adaptive workflow'}
      </button>
    </form>
  );
};
