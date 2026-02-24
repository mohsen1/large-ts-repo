import { asNamespace, asScenarioId, toEpochMs, type StageBoundary } from './types';
import type { ChaosTag, ChaosNamespace, ScenarioId, ChaosScenarioDefinition } from './types';
import { buildTopology } from './types';
import { createTopology } from './blueprints';
import type { ScenarioBlueprint } from './blueprints';

export interface SeedCatalogRow {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly ChaosTag[];
  readonly status: string;
}

const seedCatalogData: readonly SeedCatalogRow[] = [
  {
    namespace: asNamespace('platform-chaos'),
    scenarioId: asScenarioId('9f6de4d6-9cb0-4a9c-95d2-ef12f7c5fbf8'),
    title: 'Regional network partition',
    summary: 'Simulates transient regional packet and latency failure modes.',
    tags: ['control:active', 'targeted:verified'],
    status: 'idle'
  },
  {
    namespace: asNamespace('compute-chaos'),
    scenarioId: asScenarioId('2b3c7a11-5bf1-4f2f-b4a9-3e4f9f7b6ed3'),
    title: 'Node preemptibility drill',
    summary: 'Injects resource contention followed by controlled rollback.',
    tags: ['observed:active', 'blast:complete'],
    status: 'complete'
  }
];

const createdAt = toEpochMs(new Date(Date.UTC(2026, 0, 24, 12, 0, 0)));

export const chaosCatalogSeed: readonly ChaosScenarioDefinition[] = seedCatalogData.map((row) => ({
  namespace: row.namespace,
  id: row.scenarioId,
  title: row.title,
  version: '1.0.0',
  stages: [],
  createdAt
}));

export const defaultPluginNames = ['latency-loom', 'packet-fuzz', 'throttle-veil', 'node-vacuum'] as const;
export type DefaultPluginName = (typeof defaultPluginNames)[number];

export const pluginCatalogIndex = new Set<DefaultPluginName>(defaultPluginNames);

export type SeedBlueprintInput = {
  readonly runId: string;
  readonly plugins: readonly DefaultPluginName[];
};

export type SeedBlueprintOutput = { readonly ok: true };

export type SeedBlueprintSteps = readonly [
  StageBoundary<'latency', SeedBlueprintInput, SeedBlueprintOutput>
];

export async function resolveSeedBlueprint<
  TNamespace extends ChaosNamespace,
  TScenarioId extends ScenarioId
>(
  namespace: TNamespace,
  scenarioId: TScenarioId,
  options?: {
    plugins?: readonly string[];
  }
): Promise<ScenarioBlueprint<TNamespace, TScenarioId, SeedBlueprintSteps> | undefined> {
  const selected = seedCatalogData.find(
    (row) => row.namespace === namespace && row.scenarioId === scenarioId
  );
  if (!selected) {
    return undefined;
  }

  const selectedPlugins = (options?.plugins ?? defaultPluginNames)
    .filter((name): name is DefaultPluginName => pluginCatalogIndex.has(name as DefaultPluginName));

  const stage: StageBoundary<'latency', SeedBlueprintInput, SeedBlueprintOutput> = {
    name: 'latency',
    version: '1.0.0',
    metadata: { plugin: selectedPlugins[0] ?? 'latency-loom', created: 'seed' },
    input: {
      runId: `${scenarioId}:seed:${Date.now()}`,
      plugins: selectedPlugins
    },
    output: { ok: true },
    dependsOn: [],
    weight: 1
  };

  return {
    namespace,
    scenarioId,
    title: selected.title,
    description: selected.summary,
    stages: [stage],
    tags: selected.tags
  };
}

export function buildCatalogTopology(stages: readonly StageBoundary<string, unknown, unknown>[]): string {
  const topology = createTopology(stages);
  const matrix = buildTopology(stages);
  return `${topology.length}:${matrix.entries.length}`;
}
