import { useMemo } from 'react';

import { useRecoveryDrillLifecycle } from '../hooks/useRecoveryDrillLifecycle';
import type { DrillTemplateRecord, DrillRunRecord } from '@data/recovery-drill-store/src';
import type { DrillDependencies } from '@service/recovery-drill-orchestrator/src';

interface RecoveryDrillLifecyclePanelProps {
  readonly templates: readonly DrillTemplateRecord[];
  readonly runs: readonly DrillRunRecord[];
  readonly dependencies: DrillDependencies;
}

export const RecoveryDrillLifecyclePanel = ({ templates, runs, dependencies }: RecoveryDrillLifecyclePanelProps) => {
  const [state, runBatch] = useRecoveryDrillLifecycle({ templates, runs, dependencies });

  const statusText = useMemo(() => {
    if (state.errorMessage) return `error=${state.errorMessage}`;
    if (state.loading) return 'running batch...';
    return `events=${state.lastEvents.length} forecast=${state.lastForecast ? 'ready' : 'n/a'}`;
  }, [state]);

  return (
    <section>
      <h3>Drill lifecycle</h3>
      <button type="button" onClick={runBatch} disabled={!state.canRun || state.loading}>
        Execute batch plan
      </button>
      <p>{statusText}</p>
      <ul>
        {state.lastEvents.map((event) => (
          <li key={`${event.runId}-${event.at}`}>
            {event.status} at {event.at}
          </li>
        ))}
      </ul>
      {state.lastForecast ? (
        <ul>
          {state.lastForecast.topRiskBuckets.map((bucket) => (
            <li key={bucket}>risk-bucket: {bucket}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
