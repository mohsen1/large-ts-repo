import { createSignalStreamEnvelope } from './streaming-diagnostics';
import { createScenarioEnvelope, evaluateMetricPoints, summarizeSignalsByKind } from './simulation';
import { createPipeline, buildPipeline } from './pipeline';
import {
  createPluginContext,
  pluginCatalogToMap,
  pluginCatalogSeedNodes,
  pluginNameFrom,
  pluginRouteSignature,
  type PluginCatalogRecord,
  type PluginNode,
  type PluginRouteSignature,
  type PluginRunContext,
  type PluginRunInput,
  type PluginRunResult,
} from './typed-plugin-types';
import { asRun } from './identifiers';
import { normalizeTopologyNodes, buildTopologyFromPlugins } from './plugin-topology';
import { mapWithIteratorHelpers, type JsonValue, type NoInfer } from '@shared/type-level';

type RuntimePipeline = ReturnType<typeof createPipeline>;

interface PlanRuntimeInputs<TPlugins extends readonly PluginNode[]> {
  readonly normalizedPlugins: TPlugins;
  readonly workspace: ReturnType<typeof createScenarioEnvelope>;
  readonly topology: ReturnType<typeof buildTopologyFromPlugins>;
  readonly route: readonly PluginNode['name'][];
  readonly catalog: PluginCatalogRecord<TPlugins>;
  readonly catalogSignature: PluginRouteSignature<TPlugins>;
}

const asRouteSignature = <TPlugins extends readonly PluginNode[]>(
  signature: ReturnType<typeof pluginRouteSignature>,
): PluginRouteSignature<TPlugins> => signature as unknown as PluginRouteSignature<TPlugins>;

export interface PlanComposerWorkspace {
  readonly manifest: ReturnType<typeof createScenarioEnvelope>;
  readonly topology: ReturnType<typeof buildTopologyFromPlugins>;
  readonly catalog: PluginCatalogRecord<readonly PluginNode[]>;
  readonly catalogSignature: PluginRouteSignature<readonly PluginNode[]>;
  readonly route: readonly string[];
}

export interface PlanComposerResult {
  readonly workspace: PlanComposerWorkspace;
  readonly pipeline: RuntimePipeline;
  readonly pipelineId: string;
  readonly diagnostics: {
    readonly metrics: ReturnType<typeof evaluateMetricPoints>;
    readonly traces: readonly string[];
    readonly stream: ReturnType<typeof createSignalStreamEnvelope> | undefined;
  };
}

const buildRunInput = (entry: {
  readonly plugin: PluginNode;
  readonly route: readonly PluginNode['name'][];
  readonly runIndex: number;
  readonly tenant: string;
}): PluginRunInput => {
  const pluginName = pluginNameFrom(entry.plugin.name);
  return {
    runId: asRun(`run:${entry.tenant}:${entry.runIndex}-${Date.now()}`),
    kind: `signal:${entry.plugin.name.replace('plugin:', '')}` as `signal:${string}`,
    namespace: entry.plugin.namespace as PluginRunContext['namespace'],
    at: new Date().toISOString(),
    value: entry.plugin.weight,
    payload: {
      plugin: pluginName,
      route: entry.route,
      index: entry.runIndex,
    } as unknown as JsonValue,
  };
};

const routeFromNodes = (nodes: readonly PluginNode[]): readonly PluginNode['name'][] =>
  mapWithIteratorHelpers(nodes, (entry) => entry.name);

const buildCatalogWorkspace = <TPlugins extends readonly PluginNode[]>(
  tenant: string,
  plugins: TPlugins,
): PlanRuntimeInputs<TPlugins> => {
  const normalizedPlugins = normalizeTopologyNodes(plugins) as TPlugins;
  const topology = buildTopologyFromPlugins(normalizedPlugins);
  const ordered = topology.order().ordered.map((entry) => entry.plugin);
  const catalog = pluginCatalogToMap([...pluginCatalogSeedNodes, ...normalizedPlugins]);
  const seed = tenant.replace(/^tenant:/, '');
  const workspace = createScenarioEnvelope(seed, ordered.length + pluginCatalogSeedNodes.length);

  return {
    normalizedPlugins,
    workspace,
    topology,
    route: routeFromNodes(ordered),
    catalog: catalog as PluginCatalogRecord<TPlugins>,
    catalogSignature: asRouteSignature<TPlugins>(pluginRouteSignature(normalizedPlugins)),
  };
};

const buildTopologySignals = (route: readonly string[]): readonly string[] =>
  mapWithIteratorHelpers(route, (entry, index): string => `topology:${index}:${entry}`);

export const composeWorkspace = (tenant: string, signals: readonly string[], plugins: readonly PluginNode[]): PlanComposerWorkspace => {
  const runtime = buildCatalogWorkspace(tenant, plugins);
  const signalRoute = buildTopologySignals(signals);
  const tracedCatalog = pluginCatalogToMap([...pluginCatalogSeedNodes, ...runtime.normalizedPlugins]);
  return {
    manifest: runtime.workspace,
    topology: runtime.topology,
    catalog: tracedCatalog as PluginCatalogRecord<readonly PluginNode[]>,
    catalogSignature: runtime.catalogSignature as PluginRouteSignature<readonly PluginNode[]>,
    route: signalRoute,
  };
};

export const buildPlanSummary = (results: readonly PluginRunResult[]): string => {
  const score = results.reduce((acc, result) => acc + result.signalCount, 0) / Math.max(1, results.length);
  const keys = [...new Set(results.map((entry) => entry.plugin))];
  return `${results.length}::${keys.length}::${score.toFixed(2)}`;
};

const toTimelineInput = (plugins: readonly { readonly plugin: PluginNode }[]) =>
  plugins.map((entry, index) => ({
    kind: `signal:${entry.plugin.name.replace('plugin:', '')}` as `signal:${string}`,
    runId: asRun(`run:${entry.plugin.name.replace('plugin:', '')}`),
    namespace: entry.plugin.namespace as PluginRunContext['namespace'],
    at: new Date().toISOString(),
    payload: { seed: entry.plugin.weight, rank: index } as unknown as JsonValue,
  }));

export const composePlan = <TSignals extends readonly string[], TPlugins extends readonly PluginNode[]>(
  tenant: string,
  signals: NoInfer<TSignals>,
  plugins: NoInfer<TPlugins>,
): PlanComposerResult => {
  const context = createPluginContext(
    tenant,
    `namespace:${tenant.replace('tenant:', '')}`,
    `window:${tenant.replace('tenant:', '')}`,
  );
  const runtime = buildCatalogWorkspace(tenant, plugins);
  const runInputs = runtime.normalizedPlugins.map((plugin, index) =>
    buildRunInput({ plugin, route: runtime.route, runIndex: index, tenant }),
  );

  const topology = runtime.topology;
  const ordered = topology.order().ordered;
  const route = ordered.map((entry) => entry.plugin.name);
  const pipeline: RuntimePipeline = createPipeline([
    {
      id: 'stage:compose',
      name: 'compose',
      kind: 'normalize',
      onStart: async (input: unknown) => input as { readonly signalCount: number },
      transform: async (input: unknown) => {
        const typed = input as { readonly signalCount: number };
        return {
          ...typed,
          signalCount: runInputs.length + ordered.length,
        };
      },
      onError: async (_: unknown, event: unknown) => event as { readonly signalCount: number },
    },
  ]);

  const pipelineId = buildPipeline(
    context.runId,
    pipeline.steps,
    runtime.catalogSignature,
  );

  const metrics = evaluateMetricPoints(signals.map((entry) => ({ value: Math.max(1, entry.length + route.length) })));
  const byKind = summarizeSignalsByKind(
    toTimelineInput(ordered.map((entry) => ({ plugin: entry.plugin } as const))),
    tenant,
  );

  const stream = runInputs.length > 0
    ? createSignalStreamEnvelope(
        runInputs[0]!,
        runtime.normalizedPlugins,
        runInputs[0]!.kind,
      )
    : undefined;

  const workspace: PlanComposerWorkspace = {
    manifest: runtime.workspace,
    topology,
    catalog: runtime.catalog as PluginCatalogRecord<readonly PluginNode[]>,
    catalogSignature: runtime.catalogSignature as PluginRouteSignature<readonly PluginNode[]>,
    route: buildTopologySignals(route),
  };

  return {
    workspace,
    pipeline,
    pipelineId,
    diagnostics: {
      metrics,
      traces: buildTopologySignals(mapWithIteratorHelpers(Object.keys(byKind), (entry, index) => `${index}:${entry}`)),
      stream,
    },
  };
};

export const composeWorkspaceFromPlan = (
  tenant: string,
  signals: readonly string[],
  plugins: readonly PluginNode[],
): PlanRuntimeInputs<readonly PluginNode[]> => buildCatalogWorkspace(tenant, plugins);

export const buildPlanWorkspace = <TSignals extends readonly string[], TPlugins extends readonly PluginNode[]>(
  tenant: string,
  signals: NoInfer<TSignals>,
  plugins: NoInfer<TPlugins>,
): PlanRuntimeInputs<TPlugins> => buildCatalogWorkspace(tenant, plugins);
