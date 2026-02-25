import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAutonomyExperimentOrchestrator,
  toMetrics,
  type OrchestrationResult,
  type RunExperimentRequest,
  type SchedulerRunId,
} from '@service/recovery-autonomy-experiment-orchestrator';
import type { ExperimentPayload, ExperimentContext, ExperimentPlan, ExperimentIntent } from '@domain/recovery-autonomy-experiment';

interface RuntimeState {
  readonly loading: boolean;
  readonly result?: OrchestrationResult;
  readonly summary: string;
  readonly metrics?: string;
}

interface RuntimeRequest<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly intent: ExperimentIntent;
  readonly context: ExperimentContext;
  readonly payload: ExperimentPayload<TMetadata>;
  readonly plan: ExperimentPlan<TMetadata>;
}

const describe = (result: OrchestrationResult): string => {
  if (result.ok) {
    return `complete:${result.outputs.length}`;
  }
  return `failed:${result.error?.message ?? 'unknown'}`;
};

export const useAutonomyExperimentRuntime = ({ tenantId }: { readonly tenantId: string }) => {
  const [state, setState] = useState<RuntimeState>({ loading: false, summary: 'idle' });
  const orchestrator = useMemo(() => createAutonomyExperimentOrchestrator(), [tenantId]);

  const run = useCallback(async <TMeta extends Record<string, unknown>>(request: RuntimeRequest<TMeta>) => {
    const payload: RunExperimentRequest<TMeta> = {
      intent: request.intent,
      context: request.context,
      plan: request.plan,
      payload: request.payload,
    };

    setState((current) => ({ ...current, loading: true, summary: 'starting' }));
    const output = (await orchestrator.run(payload)) as OrchestrationResult;
    const metrics = toMetrics(output);

    setState((current) => ({
      ...current,
      loading: false,
      result: output,
      summary: describe(output),
      metrics: JSON.stringify(metrics),
    }));
  }, [orchestrator]);

  const bootstrap = useCallback(async () => {
    const markers = await orchestrator.bootstrap();
    setState((current) => ({ ...current, summary: `bootstrap:${markers.length}` }));
  }, [orchestrator]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const getState = useCallback((runId: SchedulerRunId) => {
    const current = orchestrator.getState(runId);
    return current?.state;
  }, [orchestrator]);

  return {
    ...state,
    run,
    getState,
    bootstrap,
  };
};
