import { useMemo } from 'react';
import { strategyOverviewFromBoard } from './StrategyReadinessPanelUtils';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { useRecoveryOperationsOrchestration } from '../../hooks/useRecoveryOperationsOrchestration';

export interface OrchestrationState {
  readonly tenant: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
}

export interface StrategyReadinessPanelProps {
  readonly repository: RecoveryOperationsRepository;
  readonly tenant: string;
}

export const StrategyReadinessPanel = ({ repository, tenant }: StrategyReadinessPanelProps) => {
  const { state, runCommand } = useRecoveryOperationsOrchestration(repository, tenant);

  const overview = useMemo(
    () =>
      strategyOverviewFromBoard({
        tenant,
        summary: state.summary,
        details: state.details,
        status: state.status,
      }),
    [state.details, state.status, state.summary, tenant],
  );

  return (
    <section>
      <h3>Strategy readiness</h3>
      <button onClick={() => void runCommand({ command: 'snapshot', tenantId: tenant })}>Capture digest</button>
      <p>{state.summary || 'No active strategies'}</p>
      <ul>
        {overview.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
};
