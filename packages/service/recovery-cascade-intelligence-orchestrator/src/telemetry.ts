import {
  type CascadeBlueprint,
  type StageContract,
  type StageName,
  normalizePolicyId,
  normalizeStrategyId,
  normalizeTenant,
} from '@domain/recovery-cascade-intelligence';
import { mapAsync, filterAsync, reduceAsync, collectArray, takeAsync } from '@shared/typed-orchestration-core';
import type { AsyncLikeIterable } from '@shared/typed-orchestration-core';

export type TopologyTelemetryKind = 'topology.ready' | 'topology.stage' | 'topology.complete';

export interface TopologyTelemetry {
  readonly kind: TopologyTelemetryKind;
  readonly value: string;
  readonly at: string;
}

export interface StageRuntimeTelemetry {
  readonly kind: 'stage.start' | 'stage.end' | 'stage.skip';
  readonly stage: StageName;
  readonly elapsedMs: number;
  readonly at: string;
}

export interface TelemetrySeries<TPayload> {
  readonly startAt: string;
  readonly points: readonly TPayload[];
}

export type TopologySnapshot<TBlueprint extends CascadeBlueprint> = {
  readonly blueprint: TBlueprint['namespace'];
  readonly count: number;
  readonly ordered: readonly StageName[];
  readonly tags: readonly string[];
};

export const computeDependencies = (stages: readonly StageContract[]): readonly StageName[] => {
  const graph = new Map<StageName, Set<StageName>>();
  for (const stage of stages) {
    graph.set(
      stage.name,
      new Set(stage.dependencies.map((dependency) => String(dependency).replace(/^dep:/, 'stage.') as StageName)),
    );
  }

  const ready = [...graph.entries()].filter(([, dependencies]) => dependencies.size === 0).map(([name]) => name);
  const seen = new Set<StageName>();
  const ordered: StageName[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (!current || seen.has(current)) {
      continue;
    }

    seen.add(current);
    ordered.push(current);

    for (const [next, dependencies] of graph.entries()) {
      if (dependencies.delete(current) && dependencies.size === 0) {
        ready.push(next);
      }
    }

    ready.sort();
  }

  if (ordered.length !== stages.length) {
    throw new Error('topology.cycle');
  }

  return ordered;
};

export const toBlueprintSnapshot = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): TopologySnapshot<TBlueprint> => ({
  blueprint: blueprint.namespace,
  count: blueprint.stages.length,
  ordered: computeDependencies(blueprint.stages),
  tags: [blueprint.namespace, `stages:${blueprint.stages.length}`],
});

export const toTelemetryRecord = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): TopologyTelemetry => ({
  kind: 'topology.ready',
  value: `${blueprint.namespace}:${blueprint.policyId}:${blueprint.stages.length}`,
  at: new Date().toISOString(),
});

export const asStageRecord = <TInput extends object>(
  stage: { readonly name: StageName; readonly metadata: TInput; readonly weight: number },
  elapsedMs: number,
): StageRuntimeTelemetry => ({
  kind: elapsedMs > 0 ? 'stage.end' : 'stage.skip',
  stage: stage.name,
  elapsedMs,
  at: new Date().toISOString(),
});

const formatTelemetry = async function* <TPayload extends { at: string }>(
  source: AsyncLikeIterable<TPayload>,
): AsyncGenerator<string> {
  yield `telemetry-start:${new Date().toISOString()}`;
  const withIndex = await mapAsync(source, async (event, index) => ({
    index,
    at: (event as { at: string }).at,
    event,
  }));

  for await (const item of withIndex) {
    yield `${item.index}::${String(item.at)}::${JSON.stringify(item.event)}`;
  }
  yield `telemetry-complete:${new Date().toISOString()}`;
};

export const collectTelemetry = (
  _stages: readonly StageContract[],
  source: AsyncLikeIterable<StageRuntimeTelemetry>,
): AsyncGenerator<string, void, void> => {
  return formatTelemetry(source);
};

export const runTelemetryPipeline = async (
  _stages: readonly StageContract[],
  source: AsyncLikeIterable<StageRuntimeTelemetry>,
): Promise<TelemetrySeries<string>> => {
  const filtered = filterAsync(source, (item) => item.elapsedMs >= 0);
  const points: string[] = [];
  const limited = takeAsync(filtered, 200);
  for await (const event of formatTelemetry(limited)) {
    points.push(event);
  }
  return {
    startAt: new Date().toISOString(),
    points,
  };
};

export const buildTopologyIndex = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint) => {
  const ordered = computeDependencies(blueprint.stages);
  const weights = normalizeStageWeights(blueprint.stages);
  const byIndex = Object.fromEntries(
    ordered.map((name, index) => [name, index] as const),
  ) as Readonly<Record<StageName, number>>;

  return {
    blueprint,
    ordered,
    byIndex,
    weightMap: weights,
    plugins: blueprint.stages.map((stage) => stage.name),
  };
};

export const normalizeStageWeights = (stages: readonly StageContract[]): Readonly<Record<string, number>> => {
  const output: Record<string, number> = {};
  for (const stage of stages) {
    output[stage.name] = Math.max(0.05, Math.min(Number(stage.weight) || 0.2, 1));
  }
  return output;
};

export const makeTopologyTelemetry = (blueprint: CascadeBlueprint): readonly TopologyTelemetry[] => [
  {
    kind: 'topology.ready',
    value: blueprint.namespace,
    at: new Date().toISOString(),
  },
  {
    kind: 'topology.stage',
    value: blueprint.schemaVersion,
    at: new Date().toISOString(),
  },
  {
    kind: 'topology.complete',
    value: String(blueprint.stages.length),
    at: new Date().toISOString(),
  },
];

export const telemetryToSeries = (items: readonly TopologyTelemetry[]): string =>
  items.map((item) => `${item.kind}:${item.value}:${item.at}`).join('|');

export const telemetryCount = async (source: AsyncLikeIterable<string>): Promise<number> => {
  return reduceAsync(source, async (total) => total + 1, 0);
};

export const topologyBaseline = async (blueprint: CascadeBlueprint): Promise<TopologySnapshot<CascadeBlueprint>> => {
  return toBlueprintSnapshot(blueprint as CascadeBlueprint);
};

export const telemetryReady = await (async () => toTelemetryRecord({
  namespace: 'cascade-intel:bootstrap',
  policyId: normalizePolicyId('bootstrap'),
  strategyId: normalizeStrategyId('bootstrap'),
  namespaceTag: 'policy:bootstrap',
  tenant: normalizeTenant({
    tenant: 'tenant-bootstrap',
    segment: 'default',
    environment: 'default',
  }),
  riskBand: 'low',
  stages: [],
  notes: '',
  publishedAt: new Date().toISOString(),
  schemaVersion: 'v1.0.0',
  focusStages: [],
}) )();
