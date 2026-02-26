import { Fragment } from 'react';

import { useTypeLevelStressHarness } from '../hooks/useTypeLevelStressHarness';

type TimelineMode = 'normal' | 'compact';

interface StressFlowTimelineProps {
  readonly tenantId: string;
  readonly mode: TimelineMode;
  readonly branch: 'north' | 'south' | 'east' | 'west' | 'diag' | 'ring' | 'fallback';
}

const renderBadge = (state: string) => {
  if (state === 'ready') return '🟦 ready';
  if (state === 'running') return '🟩 running';
  if (state === 'retry') return '🟨 retry';
  if (state === 'halted') return '🟥 halted';
  return '🟪 complete';
};

const describeState = (state: ReturnType<typeof useTypeLevelStressHarness>['flowStates'][number]) => {
  if ('startedAt' in state) {
    return `started:${new Date(state.startedAt).toISOString()}`;
  }
  if ('retryReason' in state) {
    return `retry:${state.retryReason}`;
  }
  if ('reason' in state) {
    return `halted:${state.reason}`;
  }
  if ('result' in state) {
    return `result:${state.result.status}`;
  }
  return 'unknown';
};

export const StressFlowTimeline = ({ tenantId, mode, branch }: StressFlowTimelineProps) => {
  const state = useTypeLevelStressHarness({ tenantId, branch, mode: 'ready', maxBranches: 28 });

  return (
    <section>
      <h3>Flow timeline</h3>
      <p>{`tenant ${tenantId}`}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {state.flowStates.map((flowState, index) => (
          <li
            key={`${flowState.kind}-${index}`}
            style={{
              padding: '0.5rem',
              marginBottom: '0.25rem',
              borderBottom: '1px solid #ddd',
            }}
          >
            <span>{renderBadge(flowState.kind)}</span>
            <strong style={{ margin: '0 0.5rem' }}>{flowState.kind}</strong>
            <span>{describeState(flowState)}</span>
            <span style={{ marginLeft: '1rem' }}>{`severity:${flowState.event.severity}`}</span>
            <span style={{ marginLeft: '1rem' }}>{`attempt:${flowState.event.attempt}`}</span>
          </li>
        ))}
      </ul>
      {mode === 'normal' ? (
        <Fragment>
          <p>{`dispatched: ${state.dispatchResults.length}`}</p>
          <p>{`chains: ${state.chains.length}`}</p>
          <p>{`carrier: ${state.carrier.tier}`}</p>
        </Fragment>
      ) : null}
    </section>
  );
};
