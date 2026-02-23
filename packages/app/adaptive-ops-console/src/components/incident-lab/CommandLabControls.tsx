import { useMemo } from 'react';
import type { CommandLabState, CommandLabFilter } from '../../hooks/useCommandLab';

interface CommandLabControlsProps {
  readonly state: Pick<CommandLabState, 'loading' | 'candidates' | 'order' | 'snapshot' | 'runLog' | 'drafts' | 'runs'>;
  readonly filter: CommandLabFilter;
  readonly onTenant: (tenantId: string) => void;
  readonly onHints: (hints: readonly string[]) => void;
  readonly onParallelism: (value: number) => void;
  readonly onRollbackWindow: (value: number) => void;
  readonly onReadiness: (value: number) => void;
  readonly onRisk: (value: number) => void;
  readonly onRunDraft: () => void;
  readonly onExecute: () => void;
  readonly onRefresh: () => void;
}

export const CommandLabControls = ({
  state,
  filter,
  onTenant,
  onHints,
  onParallelism,
  onRollbackWindow,
  onReadiness,
  onRisk,
  onRunDraft,
  onExecute,
  onRefresh,
}: CommandLabControlsProps) => {
  const hintsLabel = useMemo(() => filter.templateHints.join(','), [filter.templateHints]);

  return (
    <section className="command-lab-controls">
      <h2>Command Lab Controls</h2>
      <div>
        <label>
          Tenant
          <input
            value={filter.tenantId}
            onChange={(event) => onTenant(event.target.value)}
          />
        </label>
        <label>
          Hints
          <input
            value={hintsLabel}
            onChange={(event) => onHints(event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
          />
        </label>
        <label>
          Parallelism
          <input
            type="range"
            value={filter.maxParallelism}
            min={1}
            max={8}
            onChange={(event) => onParallelism(Number(event.target.value))}
          />
          <span>{filter.maxParallelism}</span>
        </label>
        <label>
          Rollback window
          <input
            type="range"
            value={filter.includeRollbackWindowMinutes}
            min={10}
            max={90}
            onChange={(event) => onRollbackWindow(Number(event.target.value))}
          />
          <span>{filter.includeRollbackWindowMinutes}</span>
        </label>
        <label>
          Readiness cutoff
          <input
            type="range"
            value={filter.minimumReadinessScore}
            min={1}
            max={10}
            onChange={(event) => onReadiness(Number(event.target.value))}
          />
          <span>{filter.minimumReadinessScore}</span>
        </label>
        <label>
          Risk cutoff
          <input
            type="range"
            value={filter.maxRiskScore}
            min={1}
            max={10}
            onChange={(event) => onRisk(Number(event.target.value))}
          />
          <span>{filter.maxRiskScore}</span>
        </label>
      </div>
      <div>
        <button onClick={onRunDraft} disabled={state.loading}>Draft plan</button>
        <button onClick={onExecute} disabled={state.loading || state.candidates.length === 0}>Execute</button>
        <button onClick={onRefresh} disabled={state.loading}>Refresh</button>
      </div>
      <section className="command-lab-summary">
        <p>State entries: {state.snapshot.length}</p>
        <p>Candidates: {state.candidates.length}</p>
        <p>Orders: {state.order.length}</p>
        <p>Drafts: {state.drafts.length}</p>
      </section>
    </section>
  );
};
