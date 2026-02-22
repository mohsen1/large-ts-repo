import type {
  OrchestratorBlueprint,
  OrchestrationId,
  OrchestrationManifest,
  OrchestrationPlan,
  OrchestrationRun,
  OrchestrationNode,
  OrchestrationEdge,
  OrchestratorService,
} from './blueprint';
import { TopologyResolver, validatePlan } from '@domain/nebula-grid/src/topology';
import type { GraphDefinition, GraphEdge, NodeId, NodeMetrics, GraphEvent } from '@domain/nebula-grid/src/primitives';

export interface RuntimeConfig {
  readonly allowRollback: boolean;
  readonly maxAttempts: number;
  readonly dryRun: boolean;
}

export interface RuntimeState {
  readonly phase: 'prepared' | 'running' | 'finalizing' | 'finalized';
  readonly manifest: OrchestrationManifest;
  readonly plan?: OrchestrationPlan;
  readonly lastEvent?: GraphEvent;
  readonly attempts: number;
}

export interface RuntimeEngine {
  start(manifest: OrchestrationManifest): Promise<OrchestrationRun>;
  continue(run: OrchestrationRun): Promise<OrchestrationRun>;
  halt(run: OrchestrationRun): Promise<OrchestrationRun>;
}

const defaultConfig: RuntimeConfig = {
  allowRollback: true,
  maxAttempts: 5,
  dryRun: false,
};

export class OrchestrationRuntime implements OrchestratorService, RuntimeEngine {
  private readonly config: RuntimeConfig;
  private readonly state = new Map<OrchestrationId, RuntimeState>();
  private readonly resolver = new TopologyResolver(
    {
      enforceAcyclic: true,
      forbidCrossRegionEdges: false,
      maxOutDegree: 100,
      maxHopCount: 100,
    },
    {
      id: 0 as never,
      region: 'us-east',
      owner: { tenantId: 'tenant', accountId: 'acct' },
      stamp: 0 as never,
      revision: 1,
      window: { sampleWindowMs: 100, targetRps: 1_000, maxBurst: 10 },
    },
  );

  constructor(config: Partial<RuntimeConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async compile(input: OrchestratorBlueprint): Promise<OrchestrationPlan> {
    const graph = await this.toGraph(input);
    return {
      id: `orch-${input.id}-plan` as OrchestrationId,
      compiledAt: Date.now(),
      graph,
      order: input.nodes.map((node) => node.id as OrchestrationId),
      edges: input.edges,
      metadata: { nodes: input.nodes.length, edges: input.edges.length },
    };
  }

  async deploy(plan: OrchestrationPlan): Promise<OrchestrationRun> {
    const run: OrchestrationRun = {
      id: plan.id,
      manifestId: `orch-${plan.id}-manifest` as OrchestrationId,
      startedAt: Date.now(),
      status: 'running',
      attempts: 1,
      log: ['deploy'],
    };
    this.state.set(run.id as OrchestrationId, {
      phase: 'running',
      manifest: {
        id: run.manifestId,
        project: 'default',
        revision: 1,
        blueprint: {
          id: plan.id,
          name: `runtime-${plan.id}`,
          graph: plan.graph.id,
          nodes: [],
          edges: [],
          labels: {},
        },
        createdAt: Date.now(),
        owner: 'runtime',
      },
      plan,
      attempts: 1,
    });
    return run;
  }

  async rollback(run: OrchestrationRun): Promise<boolean> {
    const state = this.state.get(run.id as OrchestrationId);
    if (!state) return false;
    this.state.set(run.id as OrchestrationId, { ...state, phase: 'finalizing', attempts: state.attempts + 1 });
    return true;
  }

  async start(manifest: OrchestrationManifest): Promise<OrchestrationRun> {
    const plan = await this.compile(manifest.blueprint);
    const run = await this.deploy(plan);
    return {
      ...run,
      status: 'running',
    };
  }

  async continue(run: OrchestrationRun): Promise<OrchestrationRun> {
    if (run.status === 'succeeded' || run.status === 'failed') return run;
    const state = this.state.get(run.id as OrchestrationId);
    if (!state) return run;
    const nextStatus = state.attempts >= this.config.maxAttempts ? 'failed' : 'running';
    return {
      ...run,
      attempts: state.attempts + 1,
      status: nextStatus,
      log: [...run.log, `continue:${state.attempts}`],
    };
  }

  async halt(run: OrchestrationRun): Promise<OrchestrationRun> {
    const state = this.state.get(run.id as OrchestrationId);
    if (!state) return run;
    return {
      ...run,
      status: 'failed',
      log: [...run.log, 'halt'],
    };
  }

  async validate(blueprint: OrchestratorBlueprint): Promise<ReturnType<typeof validatePlan>> {
    const plan = await this.compile(blueprint);
    const graph = await this.toGraph(blueprint);
    const report = validatePlan({ id: blueprint.graph, requestedBy: 'runtime', policy: { enforceAcyclic: true, forbidCrossRegionEdges: false, maxOutDegree: 100, maxHopCount: 100 }, desiredNodeCount: graph.nodes.length, desiredEdgeCount: graph.edges.length, createdAt: Date.now() }, {
      nodes: graph.nodes,
      edges: graph.edges,
      ctx: graph.ctx,
    });
    return report;
  }

  async executeStep(plan: OrchestrationPlan, step: OrchestrationNode): Promise<NodeMetrics> {
    return {
      observed: plan.order.length,
      dropped: step.weight,
      retried: step.enabled ? 0 : 1,
      delayedMs: step.weight * 3,
      latencyP50Ms: 10,
      latencyP95Ms: 50,
      latencyP99Ms: 100,
    };
  }

  private async toGraph(blueprint: OrchestratorBlueprint): Promise<GraphDefinition> {
    const nodes = blueprint.nodes.map((node, idx) => ({
      kind: node.kind === 'validate' ? ('source' as const) : ('transform' as const),
      id: node.id,
      region: 'us-east',
      owner: { tenantId: 'tenant', accountId: 'acct' },
      constraints: [],
      fingerprint: { hash: `${blueprint.id}-${idx}`, stable: true, version: 1 },
      metrics: {
        observed: idx + 1,
        dropped: 0,
        retried: 0,
        delayedMs: 1,
        latencyP50Ms: 2,
        latencyP95Ms: 3,
        latencyP99Ms: 4,
      },
      policy: {
        attempts: 3,
        backoffMs: [25, 50, 75],
        jitterPercent: 5,
        stopOnRetryable: false,
      },
      tags: { kind: node.kind, phase: 'compile' },
      input: null,
      outputType: 'json',
      endpoint: `endpoint-${idx}`,
      schema: {},
      transform: (value: never) => value,
      compiledShader: `shader-${idx}`,
      accepted: 'ok',
      output: {} as never,
      ttlMs: 1000,
      maxItems: 100,
      evictOnError: false,
      store: async () => Promise.resolve(),
      lookup: async () => Promise.resolve(null as never),
      source: `source-${idx}`,
      protocol: 'grpc',
      transformEdge: `edge-${idx}` as never,
      commandBus: `bus-${idx}`,
      guards: [],
      exports: ['json'],
      compression: 'none',
    } as never));
    const edges: GraphEdge[] = blueprint.edges.map((edge, index) => ({
      id: edge.id,
      from: edge.from as NodeId,
      to: edge.to as NodeId,
      kind: 'data',
      capacityPerSecond: (index + 1) * 10,
      policy: {
        attempts: 3,
        backoffMs: [5, 10, 20],
        jitterPercent: 3,
        stopOnRetryable: false,
      },
      metrics: {
        throughput: index + 1,
        saturation: Math.min(1, index / 10),
        droppedPackets: 0,
        blockedRetries: 0,
        retryPenalty: 0,
      },
    }));

    return {
      id: blueprint.graph,
      ctx: {
        id: 0 as never,
        region: 'us-east',
        owner: { tenantId: 'tenant', accountId: 'acct' },
        stamp: 0 as never,
        revision: 1,
        window: { sampleWindowMs: 1000, targetRps: 100, maxBurst: 50 },
      },
      nodes,
      edges,
      created: Date.now(),
    };
  }
}

export function cloneGraph(graph: GraphDefinition): GraphDefinition {
  return {
    id: `${graph.id}-clone` as never,
    ctx: { ...graph.ctx },
    nodes: [...graph.nodes],
    edges: [...graph.edges],
    created: graph.created,
  };
}

export function simulateRuntime(plan: OrchestrationPlan): OrchestrationRun {
  return {
    id: `orch-${plan.id}` as OrchestrationId,
    manifestId: `orch-${plan.id}-manifest` as OrchestrationId,
    startedAt: Date.now(),
    status: 'running',
    attempts: 0,
    log: ['simulated'],
  };
}
