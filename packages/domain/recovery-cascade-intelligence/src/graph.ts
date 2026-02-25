import type {
  CascadeBlueprint,
  StageDependencyTag,
  StageInputByName,
  StageName,
  StageNameFromManifest,
} from './types.js';

export type TopologyEdge<TStage extends StageNameFromManifest<any> = StageNameFromManifest<any>> = {
  readonly from: TStage;
  readonly to: TStage;
  readonly weight: number;
  readonly channel: `c:${string}`;
};

export interface TopologySnapshot<TBlueprint extends CascadeBlueprint> {
  readonly ordered: readonly StageNameFromManifest<TBlueprint>[];
  readonly edges: readonly TopologyEdge<StageNameFromManifest<TBlueprint>>[];
  readonly totalWeight: number;
  readonly source: TBlueprint['namespace'];
}

export interface TopologyPath<T> {
  readonly head: T;
  readonly tail: readonly T[];
  readonly length: number;
  readonly hops: readonly T[];
}

const stageDependencyMap = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint) => {
  return new Map<string, Set<string>>(
    blueprint.stages.map((stage) => [
      String(stage.name),
      new Set(stage.dependencies.map((dependency) => dependency.replace(/^dep:/, ''))),
    ] satisfies readonly [string, Set<string>]),
  );
};

const normalizeStageName = (value: string): StageName =>
  value.startsWith('stage.') ? (value as StageName) : (`stage.${value}` as StageName);

export const orderStages = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): readonly StageNameFromManifest<TBlueprint>[] => {
  const map = stageDependencyMap(blueprint);
  const ready = [...map.entries()]
    .filter(([, deps]) => deps.size === 0)
    .map(([name]) => name as StageNameFromManifest<TBlueprint>);
  const output: StageNameFromManifest<TBlueprint>[] = [];
  const seen = new Set<string>();

  while (ready.length > 0) {
    const next = ready.shift();
    if (!next || seen.has(next)) {
      continue;
    }

    seen.add(next);
    output.push(next);

    for (const [name, deps] of map.entries()) {
      if (deps.delete(next) && deps.size === 0) {
        ready.push(name as StageNameFromManifest<TBlueprint>);
      }
    }

    ready.sort();
  }

  if (output.length !== blueprint.stages.length) {
    throw new Error(`topology.cycle:${blueprint.namespace}`);
  }

  return output as readonly StageNameFromManifest<TBlueprint>[];
};

export const buildEdges = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): readonly TopologyEdge<StageNameFromManifest<TBlueprint>>[] => {
  const output: TopologyEdge<StageNameFromManifest<TBlueprint>>[] = [];
  for (const stage of blueprint.stages) {
    for (const dependency of stage.dependencies) {
      output.push({
        from: normalizeStageName(String(dependency).replace(/^dep:/, '')) as StageNameFromManifest<TBlueprint>,
        to: stage.name,
        weight: Math.max(1, stage.weight),
        channel: `c:${String(stage.name).replace('stage.', 'ch-')}`,
      });
    }
  }
  return output;
};

export const snapshotBlueprint = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): TopologySnapshot<TBlueprint> => {
  const ordered = orderStages(blueprint);
  const edges = buildEdges(blueprint);
  const totalWeight = edges.reduce((total, edge) => total + edge.weight, 0);
  return {
    ordered,
    edges,
    totalWeight,
    source: blueprint.namespace,
  };
};

export const pathFromStage = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  start: StageNameFromManifest<TBlueprint>,
): TopologyPath<StageNameFromManifest<TBlueprint>> => {
  const ordered = orderStages(blueprint);
  const headIndex = ordered.indexOf(start);
  const path = headIndex >= 0 ? ordered.slice(0, headIndex + 1) : ordered;
  return {
    head: start,
    tail: path,
    length: path.length,
    hops: path,
  };
};

export const summarizeTopology = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): string => {
  const snapshot = snapshotBlueprint(blueprint);
  const hash = snapshot.edges.reduce((acc, edge) => acc + edge.weight, 0);
  return `topology:${snapshot.source}:${snapshot.ordered.length}:${hash}`;
};

export const routeEdgesFromOrder = <TBlueprint extends CascadeBlueprint>(
  ordered: readonly StageNameFromManifest<TBlueprint>[],
): readonly TopologyEdge<StageNameFromManifest<TBlueprint>>[] => ordered.flatMap((current, index) =>
  ordered
    .slice(index + 1)
    .map((next, offset) => ({
      from: current,
      to: next,
      weight: index + offset + 1,
      channel: `c:${current}`,
    })),
);

export const walkTopology = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): Iterable<StageNameFromManifest<TBlueprint>> => {
  const snapshot = snapshotBlueprint(blueprint);
  return {
    *[Symbol.iterator](): Iterator<StageNameFromManifest<TBlueprint>> {
      for (const entry of snapshot.ordered) {
        yield entry;
      }
    },
  };
};

type StageInputByBlueprint<TBlueprint extends CascadeBlueprint> = {
  [K in StageNameFromManifest<TBlueprint>]: StageInputByName<TBlueprint, K>;
};

export const mapStageInputs = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): StageInputByBlueprint<TBlueprint> => {
  const output = {} as StageInputByBlueprint<TBlueprint>;
  for (const stage of blueprint.stages) {
    const key = stage.name as StageNameFromManifest<TBlueprint>;
    output[key] = stage.input as StageInputByBlueprint<TBlueprint>[typeof key];
  }
  return output;
};

export const buildDependencyIndex = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): Readonly<Record<StageNameFromManifest<TBlueprint>, StageDependencyTag[]>> => {
  const entries = blueprint.stages.map((stage) => [stage.name, [...stage.dependencies]] as const);
  return Object.fromEntries(entries) as Readonly<Record<StageNameFromManifest<TBlueprint>, StageDependencyTag[]>>;
};
