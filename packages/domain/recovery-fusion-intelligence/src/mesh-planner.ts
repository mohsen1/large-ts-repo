import {
  type MeshEdge,
  type MeshNode,
  type MeshPhase,
  type MeshPriority,
  type MeshRunId,
  type MeshWave,
  type MeshWaveId,
  type MeshCommand,
  type MeshSignalEnvelope,
  type MeshTelemetryPoint,
} from './mesh-types';
import { isCriticalSignal, normalizePriority, makeRunId } from './mesh-types';
import { type MeshRuntimeInput, defaultTopology, phaseToMetric } from './mesh-types';

export type WavePlan = readonly MeshWave[];

export interface MeshPlannerInput {
  readonly runId: MeshRunId;
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshEdge[];
  readonly maxConcurrency: number;
  readonly seed: string;
}

export interface MeshPlannerOutput {
  readonly waves: WavePlan;
  readonly commandIds: readonly MeshCommand['commandId'][];
  readonly telemetry: readonly MeshTelemetryPoint[];
  readonly planDigest: string;
}

type NodeWeight<TNode extends MeshNode = MeshNode> = TNode['score'] & number;

type TupleBuilder<T, N extends number, Acc extends readonly T[] = []> = Acc['length'] extends N
  ? Acc
  : TupleBuilder<T, N, [...Acc, T]>;

type WavePath<TNodes extends readonly MeshNode[], Acc extends readonly MeshNode[] = []> =
  TNodes extends readonly [infer Head, ...infer Tail]
    ? Head extends MeshNode
      ? WavePath<Tail extends readonly MeshNode[] ? Tail : readonly MeshNode[], [...Acc, Head]>
      : Acc
    : Acc;

type BuildWaveId<TSeed extends string> = `wave:${TSeed}:${number}`;

export const estimateWaveWeight = (node: MeshNode): number => node.score * (node.active ? 1 : 0.3);

export const rankByWeight = (nodes: readonly MeshNode[]): readonly MeshNode[] => [...nodes].sort((left, right) => {
  const leftScore = estimateWaveWeight(left);
  const rightScore = estimateWaveWeight(right);
  return rightScore - leftScore;
});

export const mapNodePath = (nodes: readonly MeshNode[]): readonly string[] =>
  nodes.map((node) => `${node.role}:${node.id}:${node.phase}`);

export const selectCommandableNodes = (nodes: readonly MeshNode[], maxConcurrency: number): readonly MeshNode[] => {
  const sorted = rankByWeight(nodes);
  return sorted.slice(0, Math.min(sorted.length, maxConcurrency));
};

export const pickCriticalNodes = (nodes: readonly MeshNode[]): readonly MeshNode[] =>
  nodes.filter((node) => isCriticalSignal(normalizePriority(Math.round(node.score * 5)) ? 4 as MeshPriority : 2));

export const buildWave = (
  waveIdSeed: string,
  runId: MeshRunId,
  nodes: readonly MeshNode[],
  startAt: string,
  windowMinutes: number,
): MeshWave => ({
  id: `wave:${waveIdSeed}` as MeshWaveId,
  runId,
  commandIds: nodes.map((node, index) => `${node.id}:cmd:${index}` as MeshCommand['commandId']),
  nodes: nodes.map((node) => node.id),
  startAt,
  windowMinutes,
});

export const emitTelemetry = (runId: MeshRunId, phase: MeshPhase): MeshTelemetryPoint => ({
  key: `mesh.${phase}`,
  value: Date.now(),
  runId,
  timestamp: new Date().toISOString(),
});

export const collectSignals = (
  nodes: readonly MeshNode[],
  phase: MeshPhase,
): MeshSignalEnvelope[] =>
  nodes.map((node, index) => ({
    id: `${node.id}:signal:${phase}` as MeshSignalEnvelope['id'],
    phase,
    source: node.id,
    target: nodes[index + 1]?.id,
    class: phaseToMetric(phase),
    severity: normalizePriority(Math.round((node.score * 5) + index)),
    payload: { role: node.role, active: node.active },
    createdAt: new Date().toISOString(),
  }));

export const planWaves = (input: MeshPlannerInput): MeshPlannerOutput => {
  const maxConcurrency = normalizePriority(Math.round(input.maxConcurrency)) || 1;
  const sortedNodes = rankByWeight(input.nodes);
  const tuples = TupleBuilder<MeshNode, 4>();
  const planned: MeshWave[] = [];
  const telemetry: MeshTelemetryPoint[] = [];
  const planIndex = new Map<MeshNode['id'], number>();

  let waveCounter = 0;
  for (let index = 0; index < sortedNodes.length; index += maxConcurrency || 1) {
    const selected = sortedNodes.slice(index, index + maxConcurrency);
    const waveId = `${input.seed}:W${waveCounter++}` as MeshWave['id'];
    const phase: MeshPhase = waveCounter === 1 ? 'plan' : 'execute';
    const windowMinutes = Math.max(1, Math.round(selected.length * 2 + waveCounter));
    const startAt = new Date(Date.now() + (waveCounter - 1) * 900).toISOString();
    const wave = buildWave(waveId, input.runId, selected, startAt, windowMinutes);
    planned.push(wave);
    telemetry.push(emitTelemetry(input.runId, phase));
    for (const node of selected) {
      planIndex.set(node.id, waveCounter);
    }
  }

  const wavePath = mapNodePath(input.nodes);
  const wavePathDigest = [...wavePath, ...tuples.map((item) => `${item.id}`), ...wavePath].join('|');
  const commandIds = planned.flatMap((wave) => wave.commandIds);

  return {
    waves: planned,
    commandIds,
    telemetry,
    planDigest: wavePathDigest.slice(0, 120),
  };
};

export const buildPlan = (payload: MeshRuntimeInput): MeshPlannerOutput => {
  const topologyPhases = payload.phases;
  const runId = makeRunId('runtime', payload.pluginIds.join('.'));
  const plannerInput: MeshPlannerInput = {
    runId,
    nodes: topologyPhases.map((phase, index) => ({
      id: `node:${index}:${phase}` as MeshNode['id'],
      role: index % 4 === 0 ? 'source' : index % 4 === 1 ? 'transform' : index % 4 === 2 ? 'aggregator' : 'sink',
      score: (index + 1) / Math.max(1, topologyPhases.length),
      phase,
      active: true,
      metadata: { phase, version: defaultTopology.maxWaveLength },
    })),
    edges: [],
    maxConcurrency: defaultTopology.concurrency,
    seed: payload.phases.join(','),
  };

  return planWaves(plannerInput);
};
