import {
  PolicyExecutionWindow,
  PolicyNode,
  PolicyPlan,
  PolicyPlanStep,
  PolicySimulationResult,
  PolicyContextSpec,
  planPolicyGraph,
  runPlanSimulation,
} from '@domain/policy-orchestration';
import { Contract } from '@domain/contracts';
import {
  InMemoryPolicyStore,
  PolicyStoreArtifact,
  PolicyStorePlanSnapshot,
  PolicyStoreRunRecord,
  PolicyStoreSort,
} from '@data/policy-orchestration-store';
import { PolicyEvaluationContext } from '@domain/policy-engine';
export interface OrchestrationWorkspace {
  orchestratorId: string;
  contract: Contract;
  nodes: readonly PolicyNode[];
  windows: readonly PolicyExecutionWindow[];
  createdBy: string;
}

export interface RunRequest {
  orchestratorId: string;
  runBy: string;
  dryRun: boolean;
  reason: string;
  requestedConcurrency: number;
  contexts: readonly PolicyEvaluationContext[];
}

export interface RunOutcome {
  plan: PolicyPlan;
  runId: string;
  simulation: readonly PolicySimulationResult[];
  storage: {
    artifacts: readonly PolicyStoreArtifact[];
    plans: readonly PolicyStorePlanSnapshot[];
    runs: readonly PolicyStoreRunRecord[];
  };
}

const windowForNode = (node: PolicyNode): PolicyExecutionWindow =>
  node.artifact.windows[0] ?? {
    id: `${node.id}:default-window` as PolicyExecutionWindow['id'],
    start: new Date().toISOString(),
    end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  };

const seedArtifacts = (orchestratorId: string, nodes: readonly PolicyNode[]): PolicyStoreArtifact[] =>
  nodes.map((node, index) => ({
    id: `${orchestratorId}:${node.id}` as PolicyStoreArtifact['id'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    correlationId: `${orchestratorId}:seed`,
    orchestratorId,
    artifactId: node.artifact.id,
    namespace: node.artifact.target.service,
    name: `${node.artifact.name}-${index}`,
    revision: index + 1,
    state: 'active',
    payload: {
      expression: node.artifact.expression,
      priority: node.artifact.priority,
      mode: node.artifact.mode,
      windows: node.artifact.windows.map((window) => window.id),
      team: node.ownerTeam,
    },
  }));

const toPlanSnapshot = (plan: PolicyPlan): PolicyStorePlanSnapshot => ({
  id: `${plan.id}:snapshot` as PolicyStorePlanSnapshot['id'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  correlationId: `${plan.id}:correlation`,
  planId: plan.id,
  orchestratorId: plan.orchestrator,
  revision: plan.revision,
  window: `${plan.createdAt}..${new Date().toISOString()}`,
  snapshot: {
    state: plan.state,
    stepCount: plan.steps.length,
    steps: plan.steps,
  },
});

export class PolicyOrchestrationRunner {
  constructor(private readonly store: InMemoryPolicyStore = new InMemoryPolicyStore()) {}

  async run(input: OrchestrationWorkspace, request: RunRequest): Promise<RunOutcome> {
    const contexts: PolicyEvaluationContext[] = [
      {
        principal: request.runBy,
        resource: input.contract.service,
        action: 'evaluate',
        attributes: {
          runBy: request.runBy,
          orchestratorId: input.orchestratorId,
          dryRun: request.dryRun,
        },
        now: new Date(),
      },
    ];
    return this.execute(input, { ...request, contexts }, []);
  }

  async runWithContexts(input: OrchestrationWorkspace, request: RunRequest): Promise<RunOutcome> {
    return this.execute(input, request, request.contexts);
  }

  async execute(
    input: OrchestrationWorkspace,
    request: RunRequest,
    contexts: readonly PolicyEvaluationContext[],
  ): Promise<RunOutcome> {
    const graph = {
      nodes: input.nodes,
      edges: input.nodes.flatMap((node) =>
        node.dependsOn.map((dependsOn) => ({
          from: dependsOn,
          to: node.id,
        })),
      ),
    };

    const { plan, warnings } = planPolicyGraph({
      orchestratorId: input.orchestratorId,
      graph,
      requestedConcurrency: Math.max(1, request.requestedConcurrency),
      maxLatencyMs: 60_000,
    });

    const runId = `${input.orchestratorId}:${Date.now()}` as PolicyStoreRunRecord['runId'];
    const normalizedContexts: readonly PolicyContextSpec[] = contexts.length > 0
      ? contexts.map((entry) => ({
          principal: entry.principal,
          resource: entry.resource,
          action: entry.action,
          attributes: entry.attributes,
          now: entry.now.toISOString(),
        }))
      : plan.steps.flatMap((step) =>
          step.nodeIds.flatMap((nodeId) => {
            const node = input.nodes.find((candidate) => candidate.id === nodeId);
            if (!node) return [];
            return [
              {
                principal: node.ownerTeam,
                resource: node.artifact.target.service,
                action: 'execute',
                attributes: {
                  runId,
                  artifactId: node.artifact.id,
                  window: windowForNode(node).id,
                },
                now: new Date().toISOString(),
              } as PolicyContextSpec,
            ];
          }),
        );

    const nodeMap = new Map(input.nodes.map((node) => [node.id, node] as const));
    const simulation = runPlanSimulation({
      plan,
      nodes: nodeMap,
      contexts: normalizedContexts.map((context) => ({
        principal: context.principal,
        resource: context.resource,
        action: context.action,
        attributes: context.attributes,
        now: new Date(context.now),
      })),
      dryRunLabel: request.dryRun ? 'dry' : undefined,
    } as any);

    const artifacts = seedArtifacts(input.orchestratorId, input.nodes);
    await this.store.seedDefaults(input.orchestratorId, artifacts);

    const snapshot = toPlanSnapshot(plan);
    await this.store.savePlanSnapshot(snapshot);

    const runRecord: PolicyStoreRunRecord = {
      id: `${runId}:run` as PolicyStoreRunRecord['id'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      correlationId: `${runId}:run` as PolicyStoreRunRecord['correlationId'],
      runId,
      planId: plan.id,
  status: request.dryRun ? 'queued' : 'running',
      actor: request.runBy,
      summary: {
        warningCount: warnings.length,
        stepCount: plan.steps.length,
      },
      metrics: {
        warningCount: warnings.length,
        waveCount: plan.steps.length,
        nodeCount: input.nodes.length,
      },
    };
    await this.store.recordRun(runRecord);

    return {
      plan,
      runId,
      simulation,
      storage: {
        artifacts: await this.store.searchArtifacts({ orchestratorId: input.orchestratorId }, { key: 'updatedAt', order: 'desc' } as PolicyStoreSort),
        plans: await this.store.plan.listByOrchestrator(input.orchestratorId),
        runs: await this.store.searchRuns(input.orchestratorId),
      },
    };
  }
}
