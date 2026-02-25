import {
  buildTopology,
  buildTimeline,
  foldTopologyScore,
  toTimelineLine,
} from './topology.js';
import {
  asChroniclePluginId,
  asChronicleRoute,
  asChronicleRunId,
  asChronicleTag,
  asChronicleTenantId,
  asStatus,
  type ChronicleRoute,
  type ChronicleRunId,
  type ChronicleStatus,
  type TopologyGraph,
  type TopologyGraph as SharedTopologyGraph,
} from './tokens.js';

export type DiagnosticSeverity = 'info' | 'warning' | 'critical';

export interface DiagnosticResult {
  readonly route: ChronicleRoute;
  readonly runId: ChronicleRunId;
  readonly status: ChronicleStatus;
  readonly message: string;
  readonly confidence: number;
  readonly severity: DiagnosticSeverity;
  readonly tags: readonly string[];
}

export type DiagnosticCollection = {
  readonly createdAt: number;
  readonly route: ChronicleRoute;
  readonly entries: readonly DiagnosticResult[];
};

const routeForDiagnostics = asChronicleRoute('diagnostics');
const defaultTenant = asChronicleTenantId('default');
const defaultTag = asChronicleTag('bootstrap');

export const diagnosticsByStatus = (
  collection: DiagnosticCollection,
): Readonly<Record<ChronicleStatus, readonly DiagnosticResult[]>> => {
  const buckets = {
    idle: [],
    queued: [],
    running: [],
    succeeded: [],
    degraded: [],
    failed: [],
  } as Record<ChronicleStatus, DiagnosticResult[]>;

  for (const entry of collection.entries) {
    buckets[entry.status] = [...buckets[entry.status], entry];
  }

  return buckets;
};

export const evaluateArtifact = (collection: DiagnosticCollection): ChronicleStatus => {
  const counts = diagnosticsByStatus(collection);
  if (counts.failed.length > 0) return 'failed';
  if (counts.running.length > 0) return 'running';
  if (counts.degraded.length > 0) return 'degraded';
  if (counts.succeeded.length > 0) return 'succeeded';
  return 'queued';
};

export const evaluateRunScore = (collection: DiagnosticCollection): number => {
  if (collection.entries.length === 0) return 0;
  return (
    collection.entries.reduce((sum, entry) => sum + entry.confidence * (entry.status === 'succeeded' ? 2 : 1), 0) /
    collection.entries.length
  );
};

export const recordEvent = (
  collection: DiagnosticCollection,
  route: ChronicleRoute,
  status: ChronicleStatus,
  message: string,
  confidence: number,
): DiagnosticCollection => ({
  ...collection,
  route,
  entries: [
    ...collection.entries,
    {
      route,
      runId: collection.entries.at(-1)?.runId ?? asChronicleRunId(defaultTenant, route),
      status,
      message,
      confidence,
      severity: confidence > 0.8 ? 'info' : confidence > 0.5 ? 'warning' : 'critical',
      tags: [String(defaultTag)],
    },
  ],
});

export const renderDiagnostics = (collection: DiagnosticCollection): string[] => {
  return collection.entries
    .toSorted((left, right) => right.confidence - left.confidence)
    .map((entry) => `${entry.status.toUpperCase()}: ${entry.message} (${entry.route})`);
};

export const collectWarnings = (collection: DiagnosticCollection): readonly string[] =>
  collection.entries
    .filter((entry) => entry.confidence < 0.75)
    .map((entry) => `warn:${entry.message}`);

export const toJsonLines = (collection: DiagnosticCollection): string =>
  JSON.stringify(collection, null, 2);

export const buildFromTopology = async (graph: SharedTopologyGraph, runId: ChronicleRunId): Promise<DiagnosticCollection> => {
  const lines = toTimelineLine(graph);
  const entries: DiagnosticResult[] = lines.map((line, index) => ({
    route: graph.route,
    runId,
    status: index === 0 ? 'running' : index === lines.length - 1 ? 'succeeded' : 'queued',
    message: line,
    confidence: 0.4 + index * 0.08,
    severity: index > 2 ? 'warning' : 'info',
    tags: [asChroniclePluginId(`boot-${index}`)],
  }));

  return {
    createdAt: Date.now(),
    route: graph.route,
    entries,
  };
};

export const summarizeCollection = (collection: DiagnosticCollection): string => {
  const summary = diagnosticsByStatus(collection);
  const ordered: readonly ChronicleStatus[] = ['failed', 'degraded', 'running', 'queued', 'succeeded', 'idle'];
  const total = collection.entries.length;
  const active = ordered.find((status) => summary[status].length > 0) ?? 'idle';
  return `${active}: ${summary[active].length}/${total} events`;
};

export const collectHealthTrend = async (collections: readonly DiagnosticCollection[]): Promise<readonly number[]> => {
  const trend: number[] = [];
  for (const collection of collections) {
    trend.push(evaluateRunScore(collection));
    await Promise.resolve();
  }
  return trend;
};

export const normalizeCollection = async (graph: TopologyGraph | null = null): Promise<DiagnosticCollection> => {
  const route = routeForDiagnostics;
  const resolvedGraph = graph ?? buildTimeline(route, [{ phase: 'phase:boot' }, { phase: 'phase:signal' }, { phase: 'phase:verify' }]);
  const score = foldTopologyScore(resolvedGraph);
  const baseRun = asChronicleRunId(defaultTenant, route);
  return buildFromTopology(resolvedGraph, baseRun).then((collection) => ({
    ...collection,
    createdAt: Date.now() + score,
  }));
};

export const attachTag = (entry: DiagnosticResult, tag: string): DiagnosticResult => ({
  ...entry,
  tags: [...entry.tags, tag],
});

export const attachTags = (collection: DiagnosticCollection, tags: readonly string[]): DiagnosticCollection => ({
  ...collection,
  entries: collection.entries.map((entry) => ({
    ...entry,
    tags: [...entry.tags, ...tags],
  })),
});

export const isHealthy = (entry: DiagnosticResult): boolean => entry.status === 'succeeded' && entry.confidence >= 0.85;

export const healthRate = (collection: DiagnosticCollection): number => {
  const healthy = collection.entries.filter(isHealthy).length;
  return collection.entries.length === 0 ? 0 : (healthy / collection.entries.length) * 100;
};

export const diagnosticsByTag = (collection: DiagnosticCollection, tag: string): readonly DiagnosticResult[] =>
  collection.entries.filter((entry) => entry.tags.includes(tag));

export const buildTopologyFromSamples = async (): Promise<TopologyGraph> => {
  const graph = buildTopology(routeForDiagnostics, [
    { phase: 'phase:boot', weight: 1 },
    { phase: 'phase:signal', weight: 2 },
    { phase: 'phase:policy', weight: 3 },
  ]);
  return graph;
};

export const defaultDiagnostics = await normalizeCollection(await buildTopologyFromSamples());
