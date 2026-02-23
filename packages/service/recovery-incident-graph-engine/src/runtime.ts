import { buildGraphAnalysisReport, simulateWithSeed, validateGraph, validateInstructions } from '@domain/recovery-incident-graph';
import type {
  EngineControl,
  EngineRequest,
  EngineResponse,
  EngineRuntimeState,
  OrchestrationContext,
} from './types';
import { createEngineRuntimeState, controlEngine, runEngine } from './orchestrator';
import { createPlan, planToGraphText, mutateOrdering } from '@domain/recovery-incident-graph';

const now = (): string => new Date().toISOString();

export const createOrchestrationContext = (
  tenantId: string,
  requestedBy: string,
  graph: OrchestrationContext['graph'],
  signals: OrchestrationContext['signals'],
): OrchestrationContext => ({
  tenantId,
  requestedBy,
  graph,
  signals,
});

export const evaluateReadinessDelta = (base: EngineRequest, next: EngineRequest): number => {
  const baseSim = simulateWithSeed({
    graph: base.context.graph,
    signals: base.context.signals,
    maxTicks: 6,
    scenarioId: `${base.requestId}-delta-base`,
  });
  const nextSim = simulateWithSeed({
    graph: next.context.graph,
    signals: next.context.signals,
    maxTicks: 6,
    scenarioId: `${next.requestId}-delta-next`,
  });
  return nextSim.summary.completedNodeCount - baseSim.summary.completedNodeCount;
};

export const profileState = (request: EngineRequest): EngineRuntimeState => {
  const validatedGraph = validateGraph(request.context.graph);
  const plan = createPlan(request.context.graph, request.context.planOverrides ?? {});
  const mutatedPlan = mutateOrdering(plan, request.context.planOverrides?.preferredOrdering === 'criticality' ? 'reverse-alpha' : 'alpha');
  const simulation = simulateWithSeed({
    graph: request.context.graph,
    signals: request.context.signals,
    maxTicks: 8,
    scenarioId: request.requestId,
  });

  return {
    requestId: request.requestId,
    startedAt: now(),
    status:
      validatedGraph.valid && validateInstructions(request.context.graph, mutatedPlan.plan.instructions).valid ? 'running' : 'failed',
    lastEventAt: now(),
    processedNodes: simulation.summary.completedNodeCount,
  };
};

export const summarizeRuntime = (response: EngineResponse): string[] => {
  const graphReport = buildGraphAnalysisReport({
    ...response,
    meta: {
      id: response.graphId,
      tenantId: '',
      name: '',
      ownerTeam: '',
      simulationWindow: { startIso: '', endIso: '' },
      snapshot: { createdAt: '', updatedAt: '', nodeCount: 0, edgeCount: 0 },
    },
    nodes: [],
    edges: [],
  } as any);
  const planText = planToGraphText(response.plan);
  return [
    `tenant=${response.graphId}`,
    `clusters=${graphReport.clusterCount}`,
    `plan-len=${planText.split('\n').length}`,
    `traces=${response.traces.length}`,
    `status=${response.summary.readinessImprovement >= 0 ? 'improving' : 'degrading'}`,
  ];
};

export const runEngineBatch = (requests: readonly EngineRequest[]): EngineResponse[] => {
  const ordered = [...requests];

  return ordered
    .sort((left, right) => left.requestId.localeCompare(right.requestId))
    .map((request) => {
      const state = createEngineRuntimeState(request.requestId);
      const control: EngineControl = {
        action: 'resume',
        reason: 'batch-start',
        requestId: request.requestId,
      };
      const resumed = controlEngine(request.requestId, state, control);
      if (resumed.status !== 'running') {
        throw new Error(`failed to start runtime for ${request.requestId}`);
      }
      const response = runEngine(request);
      return {
        ...response,
        summary: {
          ...response.summary,
          startedAt: resumed.startedAt,
        },
      };
    });
};

export const inspectNodeReachability = (graph: EngineRequest['context']['graph'], nodeId: string): readonly string[] => {
  return graph.nodes
    .filter((node) => node.id === nodeId)
    .map((node) => node.id);
};
