import { useMemo } from 'react';
import { useResilienceOrchestration } from '../hooks/useResilienceOrchestration';

interface ResilienceCommandCenterProps {
  readonly tenantId: string;
  readonly zone: 'zone-core' | 'zone-east' | 'zone-west';
}

export const ResilienceCommandCenter = ({ tenantId, zone }: ResilienceCommandCenterProps) => {
  const { run, state } = useResilienceOrchestration(tenantId, zone);

  const canRun = useMemo(() => !state.loading, [state.loading]);

  return (
    <section style={{ display: 'grid', gap: '12px', padding: '16px' }}>
      <h3>Resilience Command Center</h3>
      <button type="button" onClick={() => void run()} disabled={!canRun}>
        {state.loading ? 'Running' : 'Run Resilience Orchestrator'}
      </button>
      {state.lastError ? <p style={{ color: 'red' }}>{state.lastError}</p> : null}
      <div>
        <h4>Plan summary</h4>
        <ul>
          {state.summary?.length ? (
            state.summary.map((step) => <li key={step}>{step}</li>)
          ) : (
            <li>No plan generated yet</li>
          )}
        </ul>
      </div>
      <div>
        <h4>Trace</h4>
        <p>{state.audit?.join(' / ') || 'not available'}</p>
      </div>
      {state.result ? (
        <pre style={{ fontSize: '12px', maxHeight: '280px', overflow: 'auto' }}>
          {JSON.stringify(state.result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
};
