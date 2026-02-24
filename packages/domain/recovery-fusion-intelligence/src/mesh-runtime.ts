import { ok, fail, type Result } from '@shared/result';

import {
  asMeshEventId,
  asMeshNodeId,
  asMeshPluginId,
  asMeshRunId,
  asMeshRuntimeMarker,
  asMeshWaveCommandId,
  asMeshWaveId,
  type MeshManifestCatalog,
  type MeshManifestEntry,
  type MeshRuntimeInput,
  type MeshWave,
  type MeshWaveCommandId,
  type MeshWaveId,
  type MeshRunId,
  type MeshRuntimeEvent,
  type MeshPhase,
} from './mesh-types';
import { MeshPluginRegistry } from './mesh-registry';
import { buildPlan, type MeshPlannerOutput } from './mesh-planner';
import {
  bootstrapMeshManifest,
  fallbackMeshRuntimeInput,
  parseManifestRecord,
  parseMeshRuntimeInput,
} from './mesh-schemas';

export interface RuntimeBundle {
  readonly manifest: MeshManifestCatalog;
  readonly manifestPlugins: readonly MeshManifestEntry[];
  readonly runtimeInput: MeshRuntimeInput;
  readonly registry: MeshPluginRegistry;
}

const manifestEvents = async function* (manifest: MeshManifestCatalog): AsyncGenerator<MeshManifestEntry> {
  for (const plugin of manifest.plugins) {
    yield plugin;
  }
};

const collectManifestPlugins = async (manifest: MeshManifestCatalog): Promise<readonly MeshManifestEntry[]> => {
  const plugins: MeshManifestEntry[] = [];
  for await (const plugin of manifestEvents(manifest)) {
    plugins.push(plugin);
  }
  return Object.freeze(plugins);
};

export const bootstrapManifest = parseManifestRecord(bootstrapMeshManifest);

const toRuntimeInput = (runId: MeshRunId): Result<MeshRuntimeInput, Error> => {
  const runtime: MeshRuntimeInput = {
    phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
    nodes: [
      {
        id: asMeshNodeId(`${runId}:source`),
        role: 'source',
        score: 0.8,
        phase: 'ingest',
        active: true,
        metadata: { source: 'bootstrap' },
      },
      {
        id: asMeshNodeId(`${runId}:transform`),
        role: 'transform',
        score: 0.6,
        phase: 'normalize',
        active: true,
        metadata: { source: 'bootstrap' },
      },
    ],
    edges: [
      {
        from: asMeshNodeId(`${runId}:source`),
        to: asMeshNodeId(`${runId}:transform`),
        weight: 0.4,
        latencyMs: 100,
        mandatory: true,
      },
    ],
    pluginIds: [asMeshPluginId('bootstrap-plugin')],
  };

  return parseMeshRuntimeInput(runtime);
};

export const buildBootstrapRuntime = async (): Promise<Result<RuntimeBundle, Error>> => {
  if (!bootstrapManifest.ok) {
    return fail(bootstrapManifest.error);
  }

  const catalog = await collectManifestPlugins(bootstrapManifest.value);
  const runId = asMeshRunId('bootstrap', bootstrapManifest.value.runId.split(':').at(1) ?? 'runtime');
  const runtimeInput = toRuntimeInput(runId);

  if (!runtimeInput.ok) {
    return fail(runtimeInput.error);
  }

  const bundleInput = runtimeInput.value.nodes.length > 0 ? runtimeInput.value : fallbackMeshRuntimeInput;
  const registry = MeshPluginRegistry.create({ strict: false, plugins: [] });

  return ok({
    manifest: bootstrapManifest.value,
    manifestPlugins: catalog,
    runtimeInput: bundleInput,
    registry,
  });
};

const buildWaveCommands = (runId: MeshRunId, waveCount: number): readonly MeshWaveCommandId[] => {
  const waves: MeshWaveCommandId[] = [];
  for (let index = 0; index < waveCount; index += 1) {
    const waveId = asMeshWaveId(runId, 'plan', index);
    waves.push(asMeshWaveCommandId(runId, waveId, index));
  }
  return waves;
};

export const bootstrapPlan = async (): Promise<Result<MeshPlannerOutput, Error>> => {
  const bundle = await buildBootstrapRuntime();
  if (!bundle.ok) {
    return fail(bundle.error);
  }

  const plan = buildPlan(bundle.value.runtimeInput);
  if (plan.waves.length === 0) {
    return fail(new Error('bootstrap plan produced no waves'));
  }

  const commandIds = buildWaveCommands(bundle.value.runtimeInput.nodes[0]
    ? asMeshRunId('bootstrap', String(bundle.value.runtimeInput.nodes[0].id))
    : bundle.value.manifest.runId, plan.waves.length);

  return ok({
    ...plan,
    commandIds,
  });
};

export const bootstrapEventSeed = (runId: MeshRunId, phase: MeshPhase, index: number): MeshRuntimeEvent => ({
  runId,
  phase,
  marker: asMeshRuntimeMarker(phase),
  payload: {
    plugin: 'bootstrap',
    step: index,
    eventId: asMeshEventId(runId, phase, index),
  },
});

export const bootstrapDiagnostics = async (): Promise<{
  readonly manifestCount: number;
  readonly nodeCount: number;
  readonly runId: MeshRunId;
}> => {
  const bundle = await buildBootstrapRuntime();
  if (!bundle.ok) {
    return { manifestCount: 0, nodeCount: 0, runId: asMeshRunId('bootstrap', 'unavailable') };
  }

  return {
    manifestCount: bundle.value.manifestPlugins.length,
    nodeCount: bundle.value.runtimeInput.nodes.length,
    runId: bundle.value.runtimeInput.nodes[0] ? asMeshRunId('bootstrap', String(bundle.value.runtimeInput.nodes[0].id)) : asMeshRunId('bootstrap', 'unknown'),
  };
};
