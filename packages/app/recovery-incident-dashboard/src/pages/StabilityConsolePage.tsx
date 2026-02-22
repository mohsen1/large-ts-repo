import { useMemo, useState } from 'react';
import { StabilityOperationsPage } from './StabilityOperationsPage';
import { StabilityOrchestratorService } from '@service/recovery-stability-orchestrator';
import type { StabilityRunId } from '@domain/recovery-stability-models';

export const StabilityConsolePage = () => {
  const [runId, setRunId] = useState<StabilityRunId>('run-stability-console' as StabilityRunId);
  const orchestrator = useMemo(() => new StabilityOrchestratorService(), []);

  return (
    <main>
      <h1>Recovery Stability Console</h1>
      <label>
        Run Id:
        <input value={runId} onChange={(event) => setRunId(event.target.value as StabilityRunId)} />
      </label>
      <StabilityOperationsPage runId={runId} />
      <article>
        <h2>Runtime details</h2>
        <pre>{JSON.stringify({ hasOrchestrator: !!orchestrator }, null, 2)}</pre>
      </article>
    </main>
  );
};
