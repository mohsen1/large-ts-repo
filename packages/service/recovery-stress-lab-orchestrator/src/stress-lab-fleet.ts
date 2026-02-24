import { z } from 'zod';
import {
  buildPluginDefinition,
  createPluginKind,
  createPluginVersion,
  createPluginDefinitionNamespace,
  executePluginChain,
  createPluginContext,
  type CompatibleChain,
  type PluginDefinition,
  type PluginContext,
  type PluginDependency,
  type PluginId,
} from '@shared/stress-lab-runtime';
import {
  collectTraversal,
  buildGraphByLane,
  pathDepth,
  parsePath,
  normalizeGraphInput,
  type GraphInput,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeId,
  type StressLane,
  type WorkloadSignal,
  type PathSegment,
  type SplitPath,
} from '@domain/recovery-stress-lab-intelligence/flow-graph';
import {
  type StrategyResult,
  executeStrategy,
} from '@domain/recovery-stress-lab-intelligence/strategy-catalog';

const pluginNamespace = createPluginDefinitionNamespace('recovery:stress:lab');

type StrategyRuntimeContext = PluginContext<Record<string, unknown>>;

const asDependency = (id: PluginId): PluginDependency => `dep:${String(id)}` as PluginDependency;

export type FleetRunId = `${string}::fleet-run`;
export type FleetReportId = `${string}::fleet-report`;

export interface FleetManifest {
  readonly tenant: string;
  readonly zone: string;
  readonly revision: number;
}

export interface FleetRunOptions {
  readonly tenant: string;
  readonly zone: string;
  readonly graph: GraphInput;
  readonly scripts: readonly string[];
  readonly strategyInput: {
    tenant: string;
    runId: string;
    signals: readonly WorkloadSignal[];
    forecastScore: number;
  };
}

export interface FleetRunPlan {
  readonly id: FleetRunId;
  readonly manifest: FleetManifest;
  readonly graph: WorkflowGraph;
  readonly pluginSignatures: readonly string[];
  readonly laneCount: number;
}

export interface FleetRunResult {
  readonly runId: FleetRunId;
  readonly planId: FleetReportId;
  readonly summary: {
    readonly nodes: number;
    readonly edges: number;
    readonly signals: number;
    readonly recommendations: number;
    readonly traversalLength: number;
  };
  readonly strategy: StrategyResult<readonly WorkloadSignal[]>;
  readonly graph: WorkflowGraph;
}

interface FleetPluginSummary {
  readonly kind: string;
  readonly tags: readonly string[];
  readonly dependencies: readonly string[];
}

const FleetManifestSchema = z.object({
  tenant: z.string().min(1),
  zone: z.string().min(1),
  revision: z.number().int().positive().default(1),
});

const FleetRunSchema = FleetManifestSchema.extend({
  graph: z.object({
    region: z.string(),
    nodes: z.array(
      z.object({
        id: z.string(),
        lane: z.enum(['observe', 'prepare', 'simulate', 'recommend', 'report', 'restore', 'verify', 'retrospective']),
        kind: z.string(),
        outputs: z.array(z.string()),
      }),
    ),
    edges: z.array(
      z.object({
        id: z.string(),
        from: z.string(),
        to: z.array(z.string()),
        direction: z.enum(['northbound', 'southbound', 'interlane']),
        channel: z.string(),
      }),
    ),
  }),
  scripts: z.array(z.string()),
  strategyInput: z.object({
    tenant: z.string(),
    runId: z.string(),
    signals: z.array(
      z.object({
        id: z.string(),
        tenantId: z.string(),
        lane: z.enum(['observe', 'prepare', 'simulate', 'recommend', 'report', 'restore', 'verify', 'retrospective']),
        phase: z.enum(['observe', 'simulate', 'recommend']),
        score: z.number(),
        createdAt: z.number(),
        source: z.string(),
      }),
    ),
    forecastScore: z.number(),
  }),
});

const buildPluginSummary = (plugins: readonly PluginDefinition[]): readonly FleetPluginSummary[] => {
  return plugins.map((plugin) => ({
    kind: plugin.kind,
    tags: plugin.tags,
    dependencies: plugin.dependencies,
  }));
};

const signalFromScript = (script: string, tenant: string): WorkloadSignal[] => {
  const lines = script
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return lines.map((line, index) => ({
    id: `${tenant}:signal:${index}` as WorkloadSignal['id'],
    tenantId: tenant as WorkloadSignal['tenantId'],
    lane: line.includes('verify') ? 'verify' : line.includes('recommend') ? 'recommend' : line.includes('simulate') ? 'simulate' : 'observe',
    phase: line.includes('recommend') ? 'recommend' : line.includes('simulate') ? 'simulate' : 'observe',
    score: Math.min(1, (index + 1) / Math.max(1, lines.length + 1)),
    createdAt: Date.now() + index * 11,
    source: line,
  }));
};

const buildDefaultPlugins = (tenantId: string): readonly PluginDefinition[] => {
  const planPlugin = buildPluginDefinition(pluginNamespace, createPluginKind('plan'), {
    name: 'plan-plugin',
    version: createPluginVersion(1, 0, 0),
    tags: ['plan'],
    dependencies: [],
    pluginConfig: { tenantId } as Record<string, unknown>,
    run: async (context: StrategyRuntimeContext, _input: { graph: WorkflowGraph }) => ({
      ok: true,
      value: {
        manifest: `plan:${context.requestId}`,
        graph: _input.graph,
        source: typeof context.config.tenantId === 'string' ? context.config.tenantId : tenantId,
      },
      generatedAt: new Date().toISOString(),
    }),
  });

  const executePlugin = buildPluginDefinition(pluginNamespace, createPluginKind('execute'), {
    name: 'execute-plugin',
    version: createPluginVersion(1, 0, 0),
    tags: ['execute'],
    dependencies: [asDependency(planPlugin.id)],
    pluginConfig: { tenantId } as Record<string, unknown>,
    run: async (context: StrategyRuntimeContext, input: { graph: WorkflowGraph }) => ({
      ok: true,
      value: {
        manifest: `execute:${context.requestId}`,
        graph: input.graph,
        source: typeof context.config.tenantId === 'string' ? context.config.tenantId : tenantId,
      },
      generatedAt: new Date().toISOString(),
    }),
  });

  const reportPlugin = buildPluginDefinition(pluginNamespace, createPluginKind('report'), {
    name: 'report-plugin',
    version: createPluginVersion(1, 0, 0),
    tags: ['report'],
    dependencies: [asDependency(planPlugin.id), asDependency(executePlugin.id)],
    pluginConfig: { tenantId } as Record<string, unknown>,
    run: async (context: StrategyRuntimeContext, input: { graph: WorkflowGraph }) => ({
      ok: true,
      value: {
        manifest: `report:${context.requestId}`,
        graph: input.graph,
        source: typeof context.config.tenantId === 'string' ? context.config.tenantId : tenantId,
      },
      generatedAt: new Date().toISOString(),
    }),
  });

  return [planPlugin, executePlugin, reportPlugin] as readonly PluginDefinition[];
};

export const parseFleetInput = (value: unknown): GraphInput => {
  return FleetRunSchema.shape.graph.parse(value) as GraphInput;
};

export const parseFleetManifest = (input: string): FleetManifest => {
  const parsed = FleetManifestSchema.parse(JSON.parse(input) as FleetManifest);
  return { tenant: parsed.tenant, zone: parsed.zone, revision: parsed.revision };
};

export const buildFleetPlan = (tenant: string, zone: string, input: GraphInput): FleetRunPlan => {
  const manifest = { tenant, zone, revision: 1 } as FleetManifest;
  const graph = normalizeGraphInput(input);
  const pluginSignatures = buildPluginSummary(buildDefaultPlugins(tenant)).map((entry) => entry.kind);
  return {
    id: `${tenant}-${zone}-${manifest.revision}::fleet-run` as FleetRunId,
    manifest,
    graph,
    pluginSignatures,
    laneCount: buildGraphByLane(graph)
      .observe.nodes.length,
  };
};

const estimateNodeOrder = (graph: WorkflowGraph): readonly WorkflowNodeId[] => {
  const seen: WorkflowNodeId[] = [];
  for (const node of graph.nodes) {
    seen.push(node.id);
  }
  return seen;
};

const calculateDensity = (graph: WorkflowGraph): number => {
  if (graph.nodes.length === 0) {
    return 0;
  }
  return graph.edges.length / graph.nodes.length;
};

const summarizeByLaneCount = (graph: WorkflowGraph): Record<StressLane, number> => {
  const lanes = buildGraphByLane(graph);
  return {
    observe: lanes.observe.nodes.length,
    prepare: lanes.prepare.nodes.length,
    simulate: lanes.simulate.nodes.length,
    recommend: lanes.recommend.nodes.length,
    report: lanes.report.nodes.length,
    restore: lanes.restore.nodes.length,
    verify: lanes.verify.nodes.length,
    retrospective: lanes.retrospective.nodes.length,
  };
};

const pathSignature = (graph: WorkflowGraph): string => {
  const path = `${graph.region}/${graph.nodes.length}/${graph.edges.length}`;
  return path;
};

export const buildRouteSignal = (value: string): SplitPath<PathSegment> => {
  return parsePath((value || 'tenant/zone') as PathSegment);
};

const ensureChain = (plugins: readonly PluginDefinition[]): CompatibleChain<readonly PluginDefinition[]> => {
  return plugins as CompatibleChain<readonly PluginDefinition[]>;
};

export const executeFleet = async (input: FleetRunOptions): Promise<FleetRunResult> => {
  const validated = FleetRunSchema.parse(input);
  const plan = buildFleetPlan(validated.tenant, validated.zone, validated.graph);
  const signals = signalFromScript(validated.scripts.join('\n'), validated.tenant);
  const context = createPluginContext(validated.tenant, pluginNamespace, `run:${validated.strategyInput.runId}`, {
    forecastScore: validated.strategyInput.forecastScore,
    count: signals.length,
  });
  const plugins = buildDefaultPlugins(validated.tenant);

  const chainResult = await executePluginChain(
    ensureChain(plugins),
    context,
    { graph: plan.graph, signals },
  );

  const lanes = summarizeByLaneCount(plan.graph);
  const routeParts = buildRouteSignal(`tenant/${validated.tenant}`);
  const routeDepth = routeParts.length;

  const traversal = collectTraversal(plan.graph, plan.graph.nodes[0]?.id);
  const traversalLength = pathDepth(`tenant/${validated.tenant}` as PathSegment);

  const strategy = await executeStrategy(
    validated.tenant,
    plan.graph,
    signals,
  );

  const topologicalOrder = estimateNodeOrder(plan.graph);
  const _ = topologicalOrder;

  return {
    runId: `${validated.tenant}::${validated.strategyInput.runId}::fleet-run` as FleetRunId,
    planId: `${validated.tenant}::${validated.zone}::fleet-report` as FleetReportId,
    summary: {
      nodes: plan.graph.nodes.length,
      edges: plan.graph.edges.length,
      signals: signals.length,
      recommendations: chainResult.ok ? 1 : 0,
      traversalLength: Math.max(traversal.length, traversalLength),
    },
      strategy: {
        ...strategy,
      bundle: {
        ...strategy.bundle,
        createdAt: new Date().toISOString(),
        manifestHash: strategy.bundle.manifestHash,
      },
      recommendation: {
        ...strategy.recommendation,
        rationale: `${strategy.recommendation.rationale} | lanes=${pathSignature(plan.graph)} | depth=${routeDepth} | density=${calculateDensity(plan.graph)}`,
      },
      payload: {
        ...strategy.payload,
        planNotes: [...strategy.payload.planNotes, `density:${calculateDensity(plan.graph)}`, `lane.observe:${lanes.observe}`],
      },
    },
    graph: plan.graph,
  };
};

export const listFleetNodeKinds = (options: FleetRunOptions): readonly string[] => {
  const parsed = parseFleetInput(options.graph);
  return parsed.nodes.map((node) => node.kind);
};

export const summarizeFleetPlan = (plan: FleetRunPlan): string => {
  const laneInfo = buildGraphByLane(plan.graph);
  return `${plan.id}|${laneInfo.observe.nodes.length}/${laneInfo.simulate.nodes.length}/${laneInfo.recommend.nodes.length}`;
};

export const createRunLabel = <T extends string>(tenant: string, zone: T): `${T}::run` => `${zone}::run`;

export const evaluatePlans = (graphs: readonly FleetRunPlan[]): readonly string[] =>
  graphs.map((plan) => summarizeFleetPlan(plan));
