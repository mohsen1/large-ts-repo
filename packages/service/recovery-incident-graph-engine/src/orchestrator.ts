import { randomUUID } from 'crypto';

import {
  applyRules,
  createPlan,
  enforceMaxParallelism,
  evaluatePolicies,
  mutateOrdering,
  planToGraphText,
  normalizeIncidentGraph,
  simulateGraph,
  simulateWithSeed,
} from '@domain/recovery-incident-graph';
import { validateGraph, validateInstructions } from '@domain/recovery-incident-graph';

import type {
  EngineControl,
  EngineRequest,
  EngineResponse,
  EngineRuntimeState,
  OrchestrationContext,
} from './types';

const now = (): string => new Date().toISOString();

const makeTrace = (requestId: string, message: string, correlation?: string) => ({
  traceId: randomUUID(),
  at: now(),
  message,
  correlation: correlation ?? requestId,
});

const normalizeContext = (context: OrchestrationContext) => {
  const normalizedGraph = normalizeIncidentGraph(context.graph);
  const graph = applyRules(normalizedGraph);
  const policyDecision = evaluatePolicies(graph, {
    profile: {
      id: `${context.tenantId}-default` as any,
      tenantId: context.tenantId,
      profileName: 'default',
      maxParallelism: 3,
      minReadinessWindowMinutes: 15,
      allowOverrides: true,
      allowReentrance: false,
    },
  });

  return {
    graph,
    allowExecution: policyDecision.allowExecution,
    signals: policyDecision.overrides,
  };
};

const computeReadinessDelta = (before: EngineResponse['simulation'], after: EngineResponse['simulation']) =>
  after.summary.completedNodeCount - before.summary.completedNodeCount;

export const createEngineRuntimeState = (requestId: string): EngineRuntimeState => ({
  requestId,
  startedAt: now(),
  status: 'idle',
  lastEventAt: now(),
  processedNodes: 0,
});

export const controlEngine = (
  _requestId: string,
  state: EngineRuntimeState,
  control: EngineControl,
): EngineRuntimeState => {
  const status =
    control.action === 'pause'
      ? 'paused'
      : control.action === 'resume'
        ? 'running'
        : control.action === 'cancel'
          ? 'cancelled'
          : state.status;

  return {
    ...state,
    status,
    lastEventAt: now(),
    processedNodes: state.processedNodes + (status === 'running' ? 1 : 0),
  };
};

export const runEngine = (request: EngineRequest): EngineResponse => {
  const startedAt = now();
  const normalized = normalizeContext(request.context);
  const traces = [makeTrace(request.requestId, 'normalize-context')];

  if (!normalized.allowExecution) {
    throw new Error('execution blocked by policy checks');
  }

  const baseline = simulateGraph(request.context.graph, request.context.signals, 8);
  traces.push(makeTrace(request.requestId, 'baseline-simulated'));

  const plan = createPlan(normalized.graph, request.context.planOverrides ?? {});
  traces.push(makeTrace(request.requestId, `plan-created ${plan.plan.id}`));

  const policyConfig = {
    ...request.context.planOverrides,
    id: `${plan.plan.id}-cfg` as any,
    graphWindowMinutes: 45,
    signalGraceMinutes: 12,
    failureTolerancePercent: 3,
    maxRetries: 2,
    preferredOrdering: 'criticality-first' as const,
    profile: {
      id: `${request.context.tenantId}-exec` as any,
      tenantId: request.context.tenantId,
      profileName: 'execution',
      maxParallelism: 2,
      minReadinessWindowMinutes: 5,
      allowOverrides: true,
      allowReentrance: false,
    },
  };

  const throttled = enforceMaxParallelism(plan.plan.instructions, policyConfig as any);
  traces.push(makeTrace(request.requestId, 'max-parallelism-enforced'));

  const updatedPlan = mutateOrdering({ ...plan, plan: { ...plan.plan, instructions: throttled } }, 'alpha');

  const simulated = simulateWithSeed({
    graph: normalized.graph,
    signals: normalized.signals,
    maxTicks: Math.max(12, updatedPlan.plan.estimatedDurationMinutes / 3),
    scenarioId: `${request.requestId}-optimized`,
  });
  traces.push(makeTrace(request.requestId, 'optimized-simulation-complete'));

  if (!validateGraph(normalized.graph).valid) {
    throw new Error('planned graph failed validation');
  }

  if (!validateInstructions(normalized.graph, updatedPlan.plan.instructions).valid) {
    traces.push(makeTrace(request.requestId, 'instruction-validation-warning'));
  }

  const completedAt = now();
  const planText = planToGraphText(updatedPlan);

  return {
    requestId: request.requestId,
    graphId: request.context.graph.meta.id,
    accepted: true,
    plan: updatedPlan,
    simulation: {
      ...simulated,
      summary: {
        ...simulated.summary,
        totalRiskPoints: simulated.summary.totalRiskPoints + traces.length,
      },
    },
    traces,
    summary: {
      startedAt,
      completedAt,
      readinessImprovement: computeReadinessDelta(baseline, simulated),
    },
  };
};
