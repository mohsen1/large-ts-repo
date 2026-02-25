import { useMemo } from 'react';
import { useAutonomyOrchestrator } from '../hooks/useAutonomyOrchestrator';

interface AutonomyCommandCenterProps {
  readonly tenantId: string;
  readonly graphId: string;
  readonly scope: 'discover' | 'simulate' | 'assess' | 'orchestrate' | 'verify' | 'heal';
}

const buildQuickInputs = (scope: AutonomyCommandCenterProps['scope']) =>
  [
    { key: 'default', payload: { mode: 'default', scope } },
    { key: 'stress', payload: { mode: 'stress', intensity: 3, scope } },
    { key: 'repair', payload: { mode: 'repair', step: 'rollback', scope } },
  ] as const;

export const AutonomyCommandCenter = ({ tenantId, graphId, scope }: AutonomyCommandCenterProps) => {
  const orchestrator = useAutonomyOrchestrator({
    tenantId,
    graphId,
    scope,
  });

  const quickInputs = useMemo(() => buildQuickInputs(scope), [scope]);

  return (
    <section>
      <h3>Autonomy Command Center</h3>
      <p>Tenant {tenantId} · Graph {graphId}</p>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
        <strong>{orchestrator.loading ? 'Running orchestration…' : 'Idle'}</strong>
        <span>Requests: {orchestrator.requestCount}</span>
      </div>
      {orchestrator.lastRunAt ? <p style={{ opacity: 0.7 }}>Last run at {orchestrator.lastRunAt}</p> : null}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {quickInputs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => void orchestrator.run({ ...entry.payload })}
            disabled={orchestrator.loading}
          >
            Run {entry.key}
          </button>
        ))}
      </div>
      {orchestrator.state ? <p>Signals: {orchestrator.state.signals.length}</p> : null}
      {orchestrator.error ? <p style={{ color: 'crimson' }}>{orchestrator.error}</p> : null}
    </section>
  );
};
