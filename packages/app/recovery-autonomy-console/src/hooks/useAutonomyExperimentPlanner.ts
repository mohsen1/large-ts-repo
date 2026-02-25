import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildPlanFromDraft,
  createContextTemplate,
  createIntentTemplate,
  parsePlanDraft,
  makeTenantId,
  type ExperimentContext,
  type ExperimentPlan,
  type ExperimentPayload,
  type SignalChannel,
  type PlanBuildOptions,
  PHASE_SEQUENCE,
} from '@domain/recovery-autonomy-experiment';

interface PlannerState {
  readonly loading: boolean;
  readonly error?: string;
  readonly plan?: ExperimentPlan;
  readonly diagnostics: readonly string[];
}

const defaultOptions: PlanBuildOptions = {
  tenantAlias: 'console',
  maxDepth: 20,
  diagnostics: true,
};

export const useAutonomyExperimentPlanner = ({
  tenantId,
  context,
  payload,
}: {
  readonly tenantId: string;
  readonly context: Omit<ExperimentContext, 'tenantId'>;
  readonly payload: Omit<ExperimentPayload, 'metadata' | 'channels'>;
}) => {
  const [state, setState] = useState<PlannerState>({
    loading: false,
    diagnostics: [],
  });

  const tenant = useMemo(() => makeTenantId(tenantId), [tenantId]);

  const intentTemplate = useMemo(() => createIntentTemplate(tenantId, 'prepare'), [tenantId]);

  const planDraftInput = useMemo(
    () =>
      parsePlanDraft({
        draftId: `draft:${tenantId}:${Date.now()}`,
        tenant: tenantId,
        namespace: context.namespace,
        candidateNodes: [
          {
            name: 'prep',
            phase: 'prepare',
            dependencies: [],
            score: 0.77,
            metadata: { source: 'ui' },
          },
          {
            name: 'inject',
            phase: 'inject',
            dependencies: ['prep'],
            score: 0.66,
            metadata: { source: 'ui' },
          },
        ],
        targetPhases: PHASE_SEQUENCE,
      }),
    [context.namespace, tenantId],
  );

  const plan = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));

    try {
      const result = await buildPlanFromDraft(
        {
          tenant: tenantId,
          namespace: context.namespace,
          candidateNodes: planDraftInput.candidateNodes,
          targetPhases: planDraftInput.targetPhases,
        } as never,
        {
          strategy: payload.strategy,
          horizonMinutes: payload.horizonMinutes,
        },
        {
          ...defaultOptions,
          tenantAlias: tenantId,
        },
      );

      setState((current) => ({
        ...current,
        loading: false,
        plan: result.plan,
        diagnostics: result.diagnostics,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [context.namespace, payload.horizonMinutes, payload.strategy, planDraftInput, tenantId]);

  useEffect(() => {
    void plan();
  }, [plan]);

  const planIntent = useMemo(() => {
    const ctx = createContextTemplate(tenant);
    return {
      plan: state.plan,
      intent: {
        ...intentTemplate,
        tenantId: tenant,
      },
      context: {
        ...ctx,
        namespace: context.namespace,
        activePhases: context.activePhases,
        tenantLabel: `tenant:${tenantId}`,
      },
      payload: {
        strategy: payload.strategy,
        horizonMinutes: payload.horizonMinutes,
        metadata: {
          tenantId,
          source: intentTemplate.seed,
        },
        channels: ['recovery:planner', `tenant:${tenantId}`] as readonly SignalChannel[],
      },
    };
  }, [context.activePhases, context.namespace, intentTemplate, payload.horizonMinutes, payload.strategy, state.plan, tenant, tenantId]);

  return {
    ...state,
    planIntent,
    runId: intentTemplate.runId,
    clear: () => setState((current) => ({ ...current, diagnostics: [], error: undefined })),
    replan: plan,
  };
};
