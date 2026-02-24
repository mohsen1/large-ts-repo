import {
  asMeshCommandId,
  asMeshWaveCommandId,
  asMeshWaveId,
  asMeshRunId,
  defaultTopology,
  normalizePriority,
  normalizeWeightedPriority,
  phaseToSignalClass,
  type MeshEdge,
  type MeshNode,
  type MeshPhase,
  type MeshPriority,
  type MeshRunId,
  type MeshTelemetryPoint,
  type MeshWave,
  type MeshWaveCommandId,
  type MeshWaveId,
  type MeshRuntimeInput,
} from './mesh-types';

export interface MeshPlannerInput {
  readonly runId: MeshRunId;
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshEdge[];
  readonly maxConcurrency: MeshPriority;
  readonly seed: string;
}

export interface MeshPlannerOutput {
  readonly waves: readonly MeshWave[];
  readonly commandIds: readonly MeshWaveCommandId[];
  readonly telemetry: readonly MeshTelemetryPoint[];
  readonly planDigest: string;
}

export type WavePlan = readonly MeshWave[];

type WaveInputTuple<T extends readonly MeshNode[]> = readonly [...T];

const estimateWeight = (node: MeshNode): number => node.score * (node.active ? 1 : 0.3);

const normalizeNode = (node: MeshNode): MeshNode => ({
  ...node,
  score: Number.isFinite(node.score) ? Math.max(0, Math.min(1, node.score)) : 0,
});

const collectSignals = (nodes: readonly MeshNode[], phase: MeshPhase): readonly {
  readonly id: string;
  readonly phase: MeshPhase;
  readonly source: MeshNode['id'];
  readonly class: ReturnType<typeof phaseToSignalClass>;
  readonly severity: MeshPriority;
  readonly payload: { readonly role: MeshNode['role']; readonly index: number };
  readonly createdAt: string;
}[] =>
  nodes.map((node, index) => ({
    id: `${node.id}:signal:${phase}:${index}`,
    phase,
    source: node.id,
    class: phaseToSignalClass(phase),
    severity: normalizePriority(Math.round(node.score * 5)),
    payload: { role: node.role, index },
    createdAt: new Date().toISOString(),
  }));

const toSignalMap = (nodes: readonly MeshNode[], phase: MeshPhase) =>
  collectSignals(nodes, phase).reduce<Record<string, number>>((acc, signal) => {
    acc[signal.class] = (acc[signal.class] ?? 0) + 1;
    return acc;
  }, {});

const buildWaveWindow = (runId: MeshRunId, phase: MeshPhase, index: number, nodes: readonly MeshNode[]): {
  wave: MeshWave;
  commandIds: readonly MeshWaveCommandId[];
  telemetry: MeshTelemetryPoint;
} => {
  const waveId = asMeshWaveId(runId, phase, index);
  const startAt = new Date(Date.now() + index * 900).toISOString();
  const windowMinutes = Math.max(1, nodes.length + index);
  const commandIds = nodes.map((node, nodeIndex) => asMeshWaveCommandId(runId, waveId, nodeIndex));
  const commandIdsByNode = commandIds.map((commandId, commandIndex) =>
    asMeshCommandId(runId, nodes[commandIndex % nodes.length]?.id ?? nodes[0]!.id, commandIndex),
  );

  return {
    wave: {
      id: waveId,
      runId,
      commandIds,
      nodes: nodes.map((node) => node.id),
      startAt,
      windowMinutes,
    },
    commandIds,
    telemetry: {
      key: `mesh.wave.${phase}`,
      value: commandIdsByNode.length,
      runId,
      timestamp: new Date().toISOString(),
    },
  };
};

export const waveSignals = (waves: WavePlan): number => waves.reduce((sum, wave) => sum + wave.nodes.length, 0);

export const makeWavePlan = (input: MeshPlannerInput): MeshPlannerOutput => {
  const phases = defaultTopology.phases;
  const ranked = [...input.nodes].map(normalizeNode).toSorted((left, right) => estimateWeight(right) - estimateWeight(left));

  const concurrency = Math.max(1, input.maxConcurrency);
  const wavesInput: MeshNode[][] = [];

  for (let index = 0; index < ranked.length; index += concurrency) {
    wavesInput.push(ranked.slice(index, index + concurrency));
  }

  if (wavesInput.length === 0) {
    const fallback = [[...ranked][0] ?? {
      id: input.nodes[0]?.id ?? (`mesh-node:${input.seed}` as MeshNode['id']),
      role: 'source',
      score: 0.5,
      phase: 'ingest',
      active: true,
      metadata: {},
    }];
    wavesInput.push(fallback);
  }

  const allWaves: MeshWave[] = [];
  const commandIds: MeshWaveCommandId[] = [];
  const telemetry: MeshTelemetryPoint[] = [];
  const phaseWindow = Object.entries(phases)
    .map(([index]) => Number(index) % phases.length)
    .map((phaseIndex) => phases[phaseIndex % phases.length] as MeshPhase);

  for (const [index, nodes] of wavesInput.entries()) {
    const phase = phaseWindow[index % phaseWindow.length];
    const { wave, commandIds: batchCommandIds, telemetry: point } = buildWaveWindow(
      input.runId,
      phase,
      index,
      nodes,
      );
    allWaves.push(wave);
    commandIds.push(...batchCommandIds);
    telemetry.push(point);

    const signalBuckets = toSignalMap(nodes, phase);
    void signalBuckets;
  }

  const signatureParts = [input.seed, String(input.nodes.length), String(wavesInput.length), String(commandIds.length)];

  return {
    waves: Object.freeze(allWaves),
    commandIds: Object.freeze(commandIds),
    telemetry: Object.freeze(telemetry),
    planDigest: signatureParts.join('|'),
  };
};

export const buildPlan = (runtime: MeshRuntimeInput): MeshPlannerOutput => {
  const seededRunId = asMeshRunId(
    'runtime',
    runtime.pluginIds.length > 0
      ? `${runtime.pluginIds[0]}-${runtime.nodes.length}-${runtime.edges.length}`
      : `seed-${runtime.nodes.length}-${runtime.phases.length}`,
  );
  const input: MeshPlannerInput = {
    runId: seededRunId,
    nodes: runtime.nodes,
    edges: runtime.edges,
    maxConcurrency: normalizeWeightedPriority(runtime.pluginIds.length, 5),
    seed: runtime.pluginIds.map((pluginId) => pluginId).join(':'),
  };

  return makeWavePlan(input);
};

export const policyWindowSignature = (phases: readonly MeshPhase[]): string =>
  phases.toSorted().join('->');

export const selectNodeTuple = <TNodes extends readonly MeshNode[]>(nodes: TNodes): WaveInputTuple<TNodes> =>
  [...nodes] as WaveInputTuple<TNodes>;

export const toCommandIds = (wave: MeshWave): readonly string[] => [...wave.commandIds];

export const estimateTelemetry = (waves: readonly MeshWave[]): number => waves.reduce((sum, wave) => sum + wave.nodes.length, 0);

export const mapNodePath = (nodes: readonly MeshNode[]): readonly string[] => nodes.map((node) => `${node.id}/${node.role}`);

export const collectPlanMetrics = (waves: readonly MeshWave[]): readonly MeshTelemetryPoint[] =>
  waves.map((wave, index) => ({
    key: `mesh.metrics.${wave.id}`,
    value: wave.nodes.length + index,
    runId: wave.runId,
    timestamp: new Date().toISOString(),
  }));
