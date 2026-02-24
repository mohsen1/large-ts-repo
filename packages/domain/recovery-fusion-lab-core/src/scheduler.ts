import type { LabCommand, LabMetricPoint, LabRunId, LabSignal, LabWave, LabWavePhase } from './models';
import {
  asLabCommandId,
  asLabNodeId,
  asLabRunId,
  asLabSignalId,
  asLabWaveId,
  type LabWaveId,
} from './identifiers';
import type { MeshDependency, MeshForecast, MeshNodeId, MeshTopology } from './topology';

export type BandwidthHint = 'low' | 'medium' | 'high';
export type WaveMode = 'serial' | 'parallel' | 'staggered';
export type WindowWidth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface WaveCursor {
  readonly phase: LabWavePhase;
  readonly index: number;
  readonly startedAt: string;
}

export interface WaveWindow<T = unknown> {
  readonly waveId: LabWaveId;
  readonly mode: WaveMode;
  readonly nodes: readonly string[];
  readonly capacity: number;
  readonly context: T;
}

export type TupleRange<
  T,
  Min extends number,
  Max extends number,
  Current extends readonly T[] = [],
> = Current['length'] extends Max
  ? never
  : Current['length'] extends Min
    ? Current
    : TupleRange<T, Min, Max, readonly [...Current, T]>;

export type PathEdge<TNode extends string> = readonly [from: TNode, to: TNode];
export type TopologyPath<TNode extends string> = readonly [TNode, ...TNode[]] | readonly [];
export type GraphNodeWeights<TNodes extends readonly string[]> = {
  [K in TNodes[number]]: number;
};

export interface ExecutionWindow<TPhase extends LabWavePhase = LabWavePhase> {
  readonly phase: TPhase;
  readonly start: string;
  readonly end: string;
  readonly bandwidth: BandwidthHint;
}

export interface SchedulerWindowStats {
  readonly total: number;
  readonly active: number;
  readonly queued: number;
  readonly blocked: number;
}

export interface SchedulerOutput {
  readonly windows: readonly WaveWindow[];
  readonly waves: readonly LabWave[];
  readonly commandCount: number;
  readonly signalCount: number;
  readonly scheduleHealth: 'ok' | 'saturated' | 'overcommitted';
}

export interface TopologyPlanRow {
  readonly wave: LabWave;
  readonly commands: readonly LabCommand[];
  readonly metrics: readonly LabMetricPoint[];
}

const hasCapacity = (width: number): boolean => width > 0 && width <= 8;

export const createTopologicalWaves = (topology: MeshTopology): readonly MeshDependency[] => {
  const graph = topology.edges.reduce<Record<string, readonly MeshNodeId[]>>((acc, edge) => {
    const neighbors = acc[edge.from] ?? [];
    return {
      ...acc,
      [edge.from]: [...neighbors, edge.to],
    };
  }, {});

  return Object.entries(graph).map(([from, to]) => {
    const fromId = from as MeshNodeId;
    return {
      from: fromId,
      to: to[0] ?? fromId,
    };
  });
};

export const planWindows = (
  runId: string,
  phases: readonly LabWavePhase[],
  nodeCount: number,
  width: WindowWidth,
): readonly LabWave[] => {
  if (!hasCapacity(width)) {
    return [];
  }

  const canonicalRunId = asLabRunId(runId);
  const nodes = Array.from({ length: nodeCount }, (_, index) => asLabNodeId(canonicalRunId, `auto-${index}`).toString());
  const windows = phases.flatMap((phase, phaseIndex) => {
    const totalCommands = Math.max(1, Math.min(5, nodes.length));
    const windowCount = Math.max(1, width - phaseIndex + 1);
    return Array.from({ length: windowCount }, (unused, waveIndex) => {
      const commandIds = nodes.slice(0, totalCommands).map((nodeId) => asLabCommandId(canonicalRunId, `${phase}-${waveIndex}-${nodeId}`));
      const commandWindow = commandIds.slice(0, Math.max(1, Math.round(totalCommands / windowCount)));
      const waveId = asLabWaveId(canonicalRunId, phase, waveIndex);
      const now = new Date();
      const start = new Date(now.getTime() + phaseIndex * 60 * 1000).toISOString();
      const end = new Date(now.getTime() + (phaseIndex + 1) * 60 * 1000).toISOString();
      return {
        waveId,
        id: waveId,
        index: waveIndex,
        runId: canonicalRunId,
        phase,
        window: [start, end],
        commandIds,
        constraints: [],
        expectedDurationMs: commandWindow.length * 200,
      } satisfies LabWave;
    });
  });

  return Object.freeze(windows);
};

export const synthesizeSignals = (
  runId: string,
  phases: readonly LabWavePhase[],
): readonly LabSignal[] => {
  const canonicalRunId = asLabRunId(runId);
  return phases.flatMap((phase, phaseIndex) =>
    Array.from({ length: phaseIndex + 1 }, (_, index) => ({
      id: asLabSignalId(canonicalRunId, `${phase}:${index}:${asLabWaveId(canonicalRunId, phase, 0)}`),
      runId: canonicalRunId,
      kind: index % 2 === 0 ? 'telemetry' : 'policy',
      phase,
      severity: (Math.max(0, Math.min(5, index + phaseIndex)) as 0 | 1 | 2 | 3 | 4 | 5),
      score: index / (phaseIndex + 1),
      source: `${phase}:source:${index}`,
      tags: ['fusion', phase],
      payload: {
        phase,
        index,
        confidence: 0.4 + phaseIndex * 0.1 + index * 0.05,
        risk: (index + phaseIndex) / (phases.length + 1),
      },
      metricPath: `metric:${phase}` as const,
      observedAt: new Date().toISOString(),
    })),
  );
};

export const buildCommands = (
  runId: string,
  waves: readonly LabWave[],
  phase: LabWavePhase,
): readonly LabCommand[] => {
  const commandIds = waves.map((wave) => wave.commandIds).flat();
  const canonicalRunId = asLabRunId(runId);
  return commandIds.map((commandId, index) => ({
    id: commandId,
    runId: canonicalRunId,
    kind: index % 2 === 0 ? 'start' : 'verify',
    phase,
    targetNode: asLabNodeId(canonicalRunId, `node-${index}`),
    rationale: `wave:${waves[0]?.id ?? 'none'}:${index}`,
    requestedBy: 'planner',
    requestedAt: new Date().toISOString(),
    scheduledAt: new Date(Date.now() + index * 600).toISOString(),
  }));
};

export const scheduleMetrics = (
  runs: readonly { readonly forecast: MeshForecast; readonly runId: string }[],
): readonly LabMetricPoint[] => {
  const output: LabMetricPoint[] = [];
  for (const { runId, forecast } of runs) {
    for (let index = 0; index < forecast.values.length; index += 1) {
      output.push({
        path: `metric:forecast:${index}` as const,
        value: forecast.values[index] ?? 0,
        unit: 'risk',
        source: runId,
        createdAt: new Date(Date.now() + index * 1000).toISOString(),
      });
    }
  }
  return Object.freeze(output);
};

export const evaluateScheduleHealth = (metrics: readonly LabMetricPoint[]): SchedulerWindowStats => {
  const metricValues = metrics.map((metric) => metric.value);
  const blockedCount = metricValues.filter((value) => value > 90).length;
  return {
    total: metrics.length,
    active: metricValues.filter((value) => value > 50).length,
    queued: metrics.length - metricValues.length,
    blocked: blockedCount,
  };
};

export const normalizeTopologySignals = (topology: MeshTopology): readonly MeshNodeId[] => {
  const iterator = Array.from(topology.nodes).map((node) => node.id);
  const unique = new Map<string, MeshNodeId>();
  for (const nodeId of iterator) {
    unique.set(nodeId, nodeId);
  }
  return [...unique.values()];
};

export const buildSchedulerOutput = (
  runId: string,
  topology: MeshTopology,
): SchedulerOutput => {
  const phases: readonly LabWavePhase[] = ['capture', 'plan', 'simulate', 'execute', 'observe'];
  const nodes = Math.max(1, topology.nodes.length);
  const waves = planWindows(runId, phases, nodes, 3);
  const commands = buildCommands(runId, waves, 'plan');
  const signals = synthesizeSignals(runId, phases);
  const waveWindowStats = evaluateScheduleHealth(
    scheduleMetrics([{ runId, forecast: { timestamps: [], values: waves.map((wave) => wave.expectedDurationMs) } }]),
  );
  return {
    windows: waves.map((wave) => ({
      waveId: wave.id,
      mode: wave.commandIds.length > 2 ? 'parallel' : 'serial',
      nodes: wave.commandIds,
      capacity: wave.commandIds.length,
      context: {
        commandCount: wave.commandIds.length,
        runId: wave.runId,
        constraints: wave.constraints,
      },
    })),
    waves,
    commandCount: commands.length,
    signalCount: signals.length,
    scheduleHealth:
      waveWindowStats.blocked > 2
        ? 'overcommitted'
        : waveWindowStats.active > 3
          ? 'saturated'
          : 'ok',
  };
};

export const planFromTopology = (
  runId: string,
  topology: MeshTopology,
  phaseHint: WaveMode,
): readonly TopologyPlanRow[] => {
  const topologyNodes = normalizeTopologySignals(topology);
  const phaseList: readonly LabWavePhase[] = ['capture', 'plan', 'simulate', 'execute', 'observe'];
  const waves = planWindows(runId, phaseList, topologyNodes.length, phaseHint === 'serial' ? 3 : 5);
  const commands = waves.flatMap((wave) => {
    const commandPhase = wave.phase;
    return buildCommands(runId, [wave], commandPhase).map((command) => ({ ...command, phase: commandPhase }));
  });
  const metrics = scheduleMetrics([{ runId, forecast: { timestamps: [], values: waves.map((wave) => wave.expectedDurationMs) } }]);
  return waves.map((wave) => ({
    wave,
    commands: commands.filter((command) => command.phase === wave.phase),
    metrics,
  }));
};

export const scoreWindowNode = (phase: LabWavePhase, index: number): number => (phase === 'observe' ? 1 : index * 0.25 + 0.5);

export const scoreWaveNode = (context: { readonly nodes: number; readonly capacity: number }): number =>
  (context.nodes + context.capacity) / 2;

export const selectPlanWindow = <T>(
  candidates: readonly T[],
  prefer: (candidate: T) => number,
): readonly T[] => {
  const sorted = [...candidates].sort((left, right) => prefer(right) - prefer(left));
  return sorted;
};

export type WaveCatalog = Record<string, readonly LabWave[]>;

export const summarizeTopology = (waves: readonly LabWave[]): WaveCatalog =>
  waves.reduce<WaveCatalog>((acc, wave) => {
    const bucket = wave.phase;
    const existing = acc[bucket] ?? [];
    return {
      ...acc,
      [bucket]: [...existing, wave],
    };
  }, {});
