import type {
  FusionBundle,
  FusionCommand,
  FusionSignal,
  FusionTopology,
  FusionWave,
  FusionReadinessState,
} from './types';

export type CommandCatalogKey = `${string}:${string}`;

export interface CatalogRawSignalEnvelope {
  readonly key: CommandCatalogKey;
  readonly source: string;
  readonly severity: number;
  readonly confidence: number;
  readonly observedAt: string;
  readonly signal: FusionSignal;
}

export interface CommandCatalogEntry {
  readonly id: FusionCommand['id'];
  readonly bundleId: string;
  readonly action: FusionCommand['action'];
  readonly actor: string;
  readonly actionScore: number;
  readonly rationale: string;
  readonly tags: readonly string[];
}

export interface CommandCluster {
  readonly anchorSignal: FusionSignal;
  readonly entries: readonly CommandCatalogEntry[];
  readonly wave: FusionWave;
  readonly clusterKey: string;
}

export interface CommandCatalog {
  readonly entries: Map<string, readonly CommandCatalogEntry[]>;
  readonly clusters: readonly CommandCluster[];
  readonly indexByWave: Map<string, readonly CommandCatalogEntry[]>;
  readonly totalSignals: number;
}

type WaveStateWeight = Readonly<Record<FusionReadinessState, number>>;

const stateWeight: WaveStateWeight = {
  stable: 1,
  running: 0.85,
  warming: 0.72,
  degraded: 0.5,
  blocked: 0.22,
  idle: 0.4,
  failed: 0,
};

const normalizeSeverity = (severity: number): number => Math.max(0, Math.min(1, severity / 5));

const deriveClusterKey = (wave: FusionWave, source: string): string => `${wave.id}::${source}`;

const toEntry = (
  bundle: FusionBundle,
  wave: FusionWave,
  envelope: CatalogRawSignalEnvelope,
): CommandCatalogEntry[] => {
  const baseScore = normalizeSeverity(envelope.severity) / 5;
  const commandCount = Math.max(1, wave.commands.length);
  return wave.commands.length ? wave.commands.map((command) => ({
    id: `${bundle.id}:${envelope.signal.id}:${command.id}`,
    bundleId: bundle.id,
    action: command.action,
    actor: command.actor,
    actionScore: Math.max(0, Math.min(1, baseScore + stateWeight[wave.state] * 0.6 + commandCount * 0.01)),
    rationale: `${command.stepKey}:${envelope.source}`,
    tags: [...envelope.signal.tags, wave.id],
  })) : [{
    id: `${bundle.id}:${envelope.signal.id}:${wave.id}`,
    bundleId: bundle.id,
    action: 'verify',
    actor: envelope.source,
    actionScore: Math.max(0, Math.min(1, baseScore + stateWeight[wave.state])),
    rationale: `verify:${wave.state}`,
    tags: [envelope.source, wave.id],
  }];
};

const dedupeEntries = (entries: readonly CommandCatalogEntry[]): CommandCatalogEntry[] => {
  const seen = new Set<string>();
  const output: CommandCatalogEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.bundleId}:${entry.actor}:${entry.action}:${entry.rationale}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
};

const firstWave = (bundle: FusionBundle, envelope: CatalogRawSignalEnvelope): FusionWave | undefined =>
  envelope.signal.id.length > 0
    ? bundle.waves[Math.abs(envelope.signal.id.length) % Math.max(1, bundle.waves.length)]
    : undefined;

export const deriveCatalogTopology = (signals: readonly CatalogRawSignalEnvelope[], bundle: FusionBundle): FusionTopology => {
  const nodes = signals.map((signal) => ({
    id: signal.key,
    label: signal.source,
    weight: Math.max(0, Math.min(1, normalizeSeverity(signal.severity))),
    parents: [],
    children: [],
  }));

  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index]?.id ?? node.id,
    to: node.id,
    latencyMs: Math.max(1, node.weight * 250),
    riskPenalty: 1 - node.weight,
  }));

  return { nodes, edges };
};

export const buildCommandCatalog = (bundle: FusionBundle): CommandCatalog => {
  const rawSignals: CatalogRawSignalEnvelope[] = bundle.signals.map((signal) => ({
    key: `${signal.runId}:${signal.id}` as CommandCatalogKey,
    source: signal.source,
    severity: signal.severity,
    confidence: signal.confidence,
    observedAt: signal.observedAt ?? signal.detectedAt ?? new Date().toISOString(),
    signal,
  }));

  const grouped = new Map<string, CommandCatalogEntry[]>();
  const clusters: CommandCluster[] = [];
  const allEntries: CommandCatalogEntry[] = [];

  for (const envelope of rawSignals) {
    const wave = firstWave(bundle, envelope);
    const selectedWave = wave ?? bundle.waves[0]!;
    const clusterKey = `${deriveClusterKey(selectedWave, envelope.source)}:${envelope.signal.id}`;
    const existing = grouped.get(clusterKey) ?? [];
    const entries = dedupeEntries(toEntry(bundle, selectedWave, envelope));
    existing.push(...entries);
    grouped.set(clusterKey, existing);
    allEntries.push(...entries);
    clusters.push({ anchorSignal: envelope.signal, entries, wave: selectedWave, clusterKey });
  }

  const waveGroups = new Map<string, CommandCatalogEntry[]>();
  for (const entry of allEntries) {
    const bucket = waveGroups.get(`${entry.id.split(':')[0]}:wave` as string) ?? [];
    bucket.push(entry);
    waveGroups.set(`${entry.id.split(':')[0]}:wave`, bucket);
  }

  return {
    entries: grouped,
    clusters,
    indexByWave: waveGroups,
    totalSignals: rawSignals.length,
  };
};

export const summarizeCatalog = (catalog: CommandCatalog): {
  readonly totalEntries: number;
  readonly topRationales: readonly string[];
  readonly topActors: readonly string[];
} => {
  const rationaleCounts = new Map<string, number>();
  const actorCounts = new Map<string, number>();
  for (const cluster of catalog.clusters) {
    for (const entry of cluster.entries) {
      rationaleCounts.set(entry.rationale, (rationaleCounts.get(entry.rationale) ?? 0) + 1);
      actorCounts.set(entry.actor, (actorCounts.get(entry.actor) ?? 0) + 1);
    }
  }
  const topRationales = [...rationaleCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([reason]) => reason);
  const topActors = [...actorCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([actor]) => actor);
  return {
    totalEntries: catalog.entries.size,
    topRationales,
    topActors,
  };
};
