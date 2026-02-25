import { useCallback, useMemo, useState } from 'react';
import type { Result } from '@shared/result';
import {
  runEngineWithSeed,
  type OrchestrationRequest,
  type OrchestrationResult,
  type OrchestrationContext,
  createTenantContext,
  createResult,
  createDispatchInput,
  createDefaultPlanFromRequest,
} from '@service/recovery-resilience-orchestrator';
import {
  createPlan,
  buildPolicy,
  type ZoneCode,
  type EventType,
  type ScenarioPolicy,
  type RecoveryPlan,
} from '@domain/recovery-resilience-models';
import { createRunId } from '@shared/recovery-ops-runtime';

export interface ResilienceHookState {
  readonly loading: boolean;
  readonly lastError?: string;
  readonly result?: OrchestrationResult;
  readonly trace?: OrchestrationResult['trace'];
  readonly plan?: RecoveryPlan;
  readonly policy?: ScenarioPolicy;
  readonly summary: readonly string[];
  readonly audit: readonly string[];
}

const seedEvents = (zone: string): readonly EventType[] => {
  const base: readonly EventType[] = ['drift', 'blast', 'throttle', 'saga'];
  if (zone === 'zone-core') {
    return [...base, 'depletion'];
  }
  if (zone === 'zone-west') {
    return ['drift', 'blast'];
  }
  return ['drift'];
};

const asZone = (zone: string): ZoneCode => (zone === 'zone-east' || zone === 'zone-west' || zone === 'zone-core' ? zone : 'zone-core');

const parseTargetZones = (zones: readonly string[]): readonly ZoneCode[] => {
  if (zones.length === 0) {
    return ['zone-core'];
  }
  return [asZone(zones[0]), ...zones.slice(1).map(asZone)];
};

const toResultLine = (result: OrchestrationResult): readonly string[] => {
  const route = result.route;
  const policy = result.policy.id;
  const steps = result.plan.steps.length;
  return [route, policy, `${steps}`];
};

const requestFromContext = (tenantId: string, zone: ZoneCode): OrchestrationRequest => {
  return {
    tenantId,
    policyId: `policy-${tenantId}`,
    zone,
    route: `analysis.${zone}` as OrchestrationRequest['route'],
    targetEvents: [...seedEvents(zone)],
  };
};

export const useResilienceOrchestration = (tenantId: string, zone: string) => {
  const [state, setState] = useState<ResilienceHookState>({
    loading: false,
    summary: [],
    audit: [],
  });

  const resolvedZone = useMemo(
    () => parseTargetZones([zone, zone === 'zone-core' ? 'zone-east' : 'zone-west']),
    [zone],
  );

  const run = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, lastError: undefined }));

    const request = requestFromContext(tenantId, resolvedZone[0]);
    const contextPlan = createDefaultPlanFromRequest(request);
    const tenantContext = createTenantContext(request);
    void tenantContext;

    const dispatchInput = createDispatchInput(request);
    void dispatchInput;

    const plan = createPlan(
      request.tenantId,
      buildPolicy(tenantId, resolvedZone),
      contextPlan.steps.map((step) => ({
        ...step,
        risk: step.risk + 0.01,
        expectedThroughput: step.expectedThroughput * 0.99,
      })),
    );

    const resultOrError = (await runEngineWithSeed(request)) as Result<OrchestrationResult, Error>;

    if (resultOrError.ok) {
      setState((previous) => ({
        ...previous,
        loading: false,
        result: resultOrError.value,
        trace: resultOrError.value.trace,
        plan: resultOrError.value.plan,
        policy: resultOrError.value.policy,
        summary: resultOrError.value.plan.steps.map((step) => `${step.name}:${step.expectedThroughput.toFixed(2)}`),
        audit: toResultLine(resultOrError.value),
      }));
      return resultOrError.value;
    }

    const fallbackPlan = createPlan(
      tenantId,
      buildPolicy(tenantId, resolvedZone),
      contextPlan.steps,
    );
    const fallbackResult = createResult(
      fallbackPlan,
      request,
      'error',
    );

    setState((previous) => ({
      ...previous,
      loading: false,
      lastError: resultOrError.error.message,
      trace: fallbackResult.trace,
      plan: fallbackPlan,
      policy: fallbackResult.policy,
      summary: fallbackPlan.steps.map((step) => step.name),
      audit: toResultLine(fallbackResult),
    }));
    return undefined;
  }, [tenantId, resolvedZone]);

  const summary = useMemo(() => {
    if (!state.plan) {
      return [];
    }
    return state.plan.steps.map((step) => `${step.name}:${step.requiredZones.join('|')}`);
  }, [state.plan]);

  const audit = useMemo(() => {
    if (!state.trace) {
      return [];
    }
    return ['trace', ...state.trace.channels];
  }, [state.trace]);

  const context = useMemo<OrchestrationContext>(() => {
    const req = requestFromContext(tenantId, resolvedZone[0]);
    return {
      request: req,
      meta: {
        runId: createRunId('trace', resolvedZone[0]),
        owner: tenantId,
        zone: resolvedZone[0],
        startedAt: Date.now(),
        tags: ['orchestration'],
      },
      dispatchInput: createDispatchInput(req),
    };
  }, [tenantId, resolvedZone]);

  return {
    run,
    context,
    state: {
      ...state,
      summary,
      audit,
    },
  };
};
