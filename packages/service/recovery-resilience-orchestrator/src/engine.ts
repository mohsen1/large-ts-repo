import {
  createRunId,
  createTraceId,
  type MeshDispatchInput,
  type MeshDispatchOutput,
  runOrchestrator,
} from '@shared/recovery-ops-runtime';
import { fail, ok, type Result } from '@shared/result';
import {
  type OrchestrationRequest,
  type OrchestrationAdapter,
  type OrchestrationResult,
  type OrchestrationContext,
  createDispatchInput,
  makeRequest,
  createTenantContext,
  createResult,
  createDefaultPlanFromRequest,
} from './contracts';
import { createStore } from '@data/recovery-resilience-store';
import { createDefaultAdapter, parseIncoming, buildProbe } from './adapters';

interface EngineState {
  adapter: OrchestrationAdapter;
}

export interface EngineInput {
  request: OrchestrationRequest;
  adapter?: OrchestrationAdapter;
}

export const createEngine = (options: { adapter?: OrchestrationAdapter } = {}): EngineState => ({
  adapter: options.adapter ?? createDefaultAdapter(),
});

const createDispatch = async (input: MeshDispatchInput): Promise<MeshDispatchOutput<{ output: string }>> => {
  const checksum = input.steps.join('|');
  return {
    ok: true,
    output: { output: `dispatched:${checksum}` },
    route: input.route,
    trace: {
      traceId: input.traceId,
      createdAt: input.createdAt,
      runId: input.runId,
      steps: input.steps,
    },
  };
};

const runDispatch = async (
  request: OrchestrationRequest,
  plan: Parameters<OrchestrationAdapter['apply']>[0],
): Promise<Result<{ routed: string }, Error>> => {
  const runId = createRunId('dispatch', request.zone);
  const dispatchInput: MeshDispatchInput = {
    ...createDispatchInput(request),
    payloadCount: plan.steps.length,
    runId,
    traceId: createTraceId(`dispatch-${request.zone}`),
    createdAt: Date.now(),
    zone: request.zone,
    route: request.route,
  };

  const output = await runOrchestrator(
    [
      {
        id: createRunId('dispatch', request.zone),
        route: request.route,
        payload: {
          entityId: request.tenantId,
          zone: request.zone,
          score: 0.88,
          severity: 1,
          metrics: { throughput: request.targetEvents.length },
        },
        trace: {
          runId: dispatchInput.runId,
          owner: request.tenantId,
          zone: request.zone,
          startedAt: Date.now(),
          tags: ['dispatch'],
        },
      },
    ],
    createDispatch,
    request.route,
  );

  if (!output.ok) {
    return fail(new Error('dispatch failed'));
  }

  return ok({ routed: output.value.output.output });
};

export const resolvePlan = async (
  request: OrchestrationRequest,
  state: EngineState,
): Promise<Result<OrchestrationResult, Error>> => {
  const store = createStore();
  await store.hydrateFromSamples(3, request.tenantId);

  const context: OrchestrationContext = {
    request,
    meta: {
      runId: createRunId('ctx', request.zone),
      owner: request.tenantId,
      zone: request.zone,
      startedAt: Date.now(),
      tags: ['engine'],
    },
    dispatchInput: createDispatchInput(request),
  };

  const _tenantContext = createTenantContext(request);
  void _tenantContext;
  const _requestPlan = makeRequest(request);
  void _requestPlan;

  const plan = createDefaultPlanFromRequest(request);
  const applied = await runDispatch(request, plan);
  if (!applied.ok) {
    return fail(applied.error);
  }

  const probe = buildProbe(request);
  void probe;

  const final = createResult(plan, request, 'running');
  const completed = await state.adapter.apply(plan);
  await store.close();

  return ok({
    ...completed,
    status: completed.status === 'complete' ? 'complete' : 'error',
    route: request.route,
    trace: completed.trace,
    plan: {
      ...plan,
      checksum: `${plan.checksum}:${applied.value.routed}`,
    },
  });
};

export const runEngine = async (input: EngineInput): Promise<Result<OrchestrationResult, Error>> => {
  if (!input.request.tenantId) {
    return fail(new Error('tenantId is required'));
  }
  const state = createEngine({ adapter: input.adapter ?? createDefaultAdapter() });
  return resolvePlan(input.request, state);
};

export const runEngineWithSeed = async (input: OrchestrationRequest): Promise<Result<OrchestrationResult, Error>> => {
  const parsed = parseIncoming(input as unknown);
  return runEngine({ request: parsed });
};

export { runOrchestrator };
