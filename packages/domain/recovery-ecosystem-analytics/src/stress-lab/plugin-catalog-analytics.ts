import {
  asRun,
  asNamespace,
  type SignalNamespace,
} from '../identifiers';
import { asSignalAlias } from '../models';
import { normalizeTopologyNodes, buildTopologyFromPlugins } from '../plugin-topology';
import {
  pluginCatalogToMap,
  pluginRouteSignature,
  type PluginNode,
  type PluginRouteSignature,
} from '../typed-plugin-types';
import { summarizeSignalsByKind, evaluateMetricPoints } from '../simulation';
import { mapWithIteratorHelpers, type JsonValue, type NoInfer } from '@shared/type-level';

export type CatalogTag = `catalog:${string}`;
export type CatalogLabel = `label:${string}`;
export type CatalogSnapshotStatus = 'idle' | 'ready' | 'dirty' | 'archived';

type CatalogRouteSignature = ReturnType<typeof pluginRouteSignature>;
type RoutePayload<TPlugins extends readonly PluginNode[]> = {
  readonly plugin: TPlugins[number]['name'];
  readonly routeIndex: number;
  readonly signature: CatalogRouteSignature;
};

interface RouteSignals {
  readonly plugin: string;
  readonly rank: number;
  readonly observedAt: string;
}

export interface CatalogSignalRow {
  readonly id: `row:${string}`;
  readonly signal: string;
  readonly score: number;
  readonly labels: readonly CatalogLabel[];
}

export interface CatalogPlan<TPlugins extends readonly PluginNode[]> {
  readonly id: `plan:${string}`;
  readonly signature: PluginRouteSignature<TPlugins>;
  readonly topology: ReturnType<typeof buildTopologyFromPlugins>;
  readonly snapshotStatus: CatalogSnapshotStatus;
  readonly records: readonly RoutePayload<TPlugins>[];
  readonly routeSignals: readonly string[];
}

export interface CatalogDiagnosticResult {
  readonly status: CatalogSnapshotStatus;
  readonly matrix: ReturnType<typeof summarizeSignalsByKind>;
  readonly score: number;
  readonly warningCount: number;
  readonly criticalCount: number;
}

const describeLabel = (seed: string): CatalogLabel => `label:${seed}`;
const buildSignalAlias = (seed: string): string => asSignalAlias(`catalog:${seed}`).replace('alias:', 'signal:');

const normalizeRecordId = (index: number, namespace: string): `row:${string}` =>
  `row:${index}:${namespace}`;

const buildTimeline = <TPlugins extends readonly PluginNode[]>(plugins: TPlugins) =>
  plugins.map((plugin, index) => ({
    plugin: plugin.name,
    rank: index,
    observedAt: new Date().toISOString(),
  }));

export const buildCatalogSignals = (plugins: readonly string[], at = new Date().toISOString()): readonly CatalogSignalRow[] =>
  mapWithIteratorHelpers(plugins, (name, index) => ({
    id: normalizeRecordId(index, name.replace('plugin:', '')),
    signal: buildSignalAlias(name),
    score: Math.max(1, name.length + index),
    labels: [describeLabel(name), describeLabel(`${at}`)],
  }));

export const collectCatalogLabels = <TPlugins extends readonly PluginNode[]>(
  plugins: NoInfer<TPlugins>,
): ReadonlyMap<string, readonly CatalogLabel[]> => {
  const map = new Map<string, readonly CatalogLabel[]>();
  for (const plugin of plugins) {
    const labels = [describeLabel(plugin.name), ...plugin.metadata?.tags.map((tag) => `label:${tag}` as CatalogLabel) ?? []] as const;
    map.set(plugin.name, labels);
  }
  return map;
};

export const buildCatalogPlan = <TPlugins extends readonly PluginNode[]>(plugins: TPlugins): CatalogPlan<TPlugins> => {
  const normalized = normalizeTopologyNodes(plugins);
  const topology = buildTopologyFromPlugins(normalized, {
    includeDetached: true,
    allowCycles: false,
    maxDepth: 12,
  });
  const signature = pluginRouteSignature(normalized) as unknown as PluginRouteSignature<TPlugins>;
  const ordered = topology.order().ordered.map((entry) => entry.plugin);
  const records: readonly RoutePayload<TPlugins>[] = mapWithIteratorHelpers(ordered, (plugin, index): RoutePayload<TPlugins> => ({
    plugin: plugin.name as TPlugins[number]['name'],
    routeIndex: index,
    signature: signature as CatalogRouteSignature,
  }));

  return {
    id: `plan:${signature}` as `plan:${string}`,
    signature,
    topology,
    snapshotStatus: ordered.length === 0 ? 'dirty' : 'ready',
    records,
    routeSignals: ordered.map((entry) => `${entry.name}:${ordered.length}`),
  };
};

export const buildCatalogMetrics = <TPlugins extends readonly PluginNode[]>(
  plugins: TPlugins,
): CatalogDiagnosticResult => {
  const plan = buildCatalogPlan(plugins);
  const namespace = asNamespace('catalog') as SignalNamespace;
  const timeline = buildTimeline(plan.topology.order().ordered.map((entry) => entry.plugin));
  const summary = summarizeSignalsByKind(
    timeline.map((entry) => ({
      kind: `signal:${entry.plugin.replace('plugin:', '')}` as `signal:${string}`,
      runId: asRun(`run:catalog-${entry.plugin}`),
      namespace,
      at: entry.observedAt,
      payload: { rank: entry.rank } as JsonValue,
    })),
    namespace,
  );
  const metrics = evaluateMetricPoints(timeline.map((entry) => ({ value: entry.rank + entry.plugin.length })));
  const byPlugin = collectCatalogLabels(plugins);
  const summaryEntries = Object.values(summary) as readonly {
    readonly score: number;
    readonly tags: readonly string[];
    readonly observedAt: string;
  }[];
  return {
    status: plan.snapshotStatus,
    matrix: summary,
    score: summaryEntries.reduce((acc, metric) => acc + metric.score, metrics.score),
    warningCount: timeline.length + byPlugin.size,
    criticalCount: plan.records.length,
  };
};

export const expandCatalogRoutes = <TPlugins extends readonly PluginNode[]>(
  plugins: TPlugins,
): readonly RoutePayload<TPlugins>[] => buildCatalogPlan(plugins).records;

export const catalogPlanDiagnostics = <TPlugins extends readonly PluginNode[]>(
  plugins: TPlugins,
): {
  readonly tags: readonly CatalogTag[];
  readonly signature: PluginRouteSignature<TPlugins>;
  readonly ready: boolean;
} => {
  const names = plugins.map((entry) => entry.name);
  return {
    tags: mapWithIteratorHelpers(names, (name) => `catalog:${name.replace('plugin:', '')}` as CatalogTag),
    signature: pluginRouteSignature(plugins) as unknown as PluginRouteSignature<TPlugins>,
    ready: names.length > 0,
  };
};

export const catalogRouteSignature = <TPlugins extends readonly PluginNode[]>(
  plugins: NoInfer<TPlugins>,
): PluginRouteSignature<TPlugins> =>
  pluginRouteSignature(plugins) as unknown as PluginRouteSignature<TPlugins>;

export const normalizeCatalogPlanRoute = (input: RouteSignals[]): readonly string[] =>
  mapWithIteratorHelpers(input, (entry) => `${entry.observedAt}:${entry.rank}:${entry.plugin.replace('plugin:', '')}`);
