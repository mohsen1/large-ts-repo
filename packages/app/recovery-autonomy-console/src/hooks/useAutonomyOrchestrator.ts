import { useCallback, useEffect, useMemo, useState } from 'react';
import { ok, err } from '@shared/result';
import { createAutonomyOrchestrator } from '@service/recovery-autonomy-orchestrator';
import { asGraphId } from '@domain/recovery-autonomy-graph';
import type { AutonomyScope } from '@domain/recovery-autonomy-graph';
import type { RunExecutionRequest, OrchestrationRunState } from '@service/recovery-autonomy-orchestrator';
import { defaultRequestClock } from '@service/recovery-autonomy-orchestrator';
import { useAutonomyOverview } from './useAutonomyOverview';

type OrchestratorPayload = Record<string, unknown>;

export interface UseAutonomyOrchestratorState {
  readonly loading: boolean;
  readonly state?: OrchestrationRunState;
  readonly error?: string;
  readonly requestCount: number;
  readonly lastRunAt?: string;
}

interface UseAutonomyOrchestratorConfig {
  readonly tenantId: string;
  readonly graphId: string;
  readonly scope: AutonomyScope;
}

export const useAutonomyOrchestrator = ({ tenantId, graphId, scope }: UseAutonomyOrchestratorConfig) => {
  const [state, setState] = useState<UseAutonomyOrchestratorState>({
    loading: false,
    requestCount: 0,
  });

  const orchestrator = useMemo(() => createAutonomyOrchestrator(), []);
  const { hydrate } = useAutonomyOverview(tenantId, graphId, scope);

  const run = useCallback(async (payload: OrchestratorPayload) => {
    setState((current) => ({ ...current, loading: true, error: undefined }));

    const request: RunExecutionRequest<AutonomyScope, OrchestratorPayload> = {
      tenantId,
      graphId: asGraphId(graphId),
      scope,
      payload,
      seed: `${tenantId}-${scope}-${Date.now()}`,
      owner: 'recovery-autonomy-console',
      tags: ['app', scope],
    };

    const result = await orchestrator.run(request, {
      failFast: true,
      maxRetries: 2,
    });

    if (!result.ok) {
      setState((current) => ({
        ...current,
        loading: false,
        requestCount: current.requestCount + 1,
        error: result.error.message,
      }));
      return;
    }

    setState((current) => ({
      loading: false,
      requestCount: current.requestCount + 1,
      state: result.value,
      lastRunAt: defaultRequestClock(),
    }));
    await hydrate();
  }, [tenantId, scope, graphId, orchestrator, hydrate]);

  const ensure = useCallback(async () => {
    const result = await orchestrator.run({
      tenantId,
      graphId: asGraphId(graphId),
      scope,
      payload: {
        bootstrap: true,
      },
      seed: `${tenantId}-bootstrap-${scope}`,
      owner: 'recovery-autonomy-console',
      tags: ['bootstrap'],
    });

    if (!result.ok) {
      return err(result.error);
    }

    return ok(undefined);
  }, [tenantId, graphId, scope, orchestrator]);

  useEffect(() => {
    void ensure();
  }, [ensure]);

  return {
    ...state,
    run,
    ensure,
  } as const;
};
