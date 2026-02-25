import { mapAsync } from '@shared/typed-orchestration-core';
import type { AsyncLikeIterable } from '@shared/typed-orchestration-core';

export type StageTopologyWeight = BrandNumber<`weight-${number}`>;
export type StageEdgeWeight = StageTopologyWeight | 0;
export type TopologyNode = {
  readonly node: string;
  readonly depth: number;
};

export type StageTopologyEdge<TStage extends string = string> = {
  readonly from: `stage.${TStage}`;
  readonly to: `stage.${TStage}`;
  readonly weight: StageEdgeWeight;
  readonly channel: `topology.${string}`;
};

export type StageTopologyNode = {
  readonly node: `stage.${string}`;
  readonly depth: number;
};

export type StageLayer<TStage extends string = string> = readonly `stage.${TStage}`[];
export type TopologyIteratorContext<TStage extends string = string> = IteratorObject<`stage.${TStage}`, void>;

type BrandNumber<TTag extends string> = BrandNumberBrand<TTag>;
type BrandNumberBrand<TTag extends string> = `${TTag}` & { readonly __brand: 'TopologyWeight' };

export type StagePathCursor = {
  readonly current: string;
  readonly history: readonly string[];
};

export type StageTopologyManifest = readonly StageTopologyEdge[];

const normalizeStage = (value: string): `stage.${string}` => (value.startsWith('stage.') ? value : (`stage.${value}` as `stage.${string}`));

const edgeWeight = (value: number): StageTopologyWeight =>
  `${Math.max(1, Math.floor(value))}` as StageTopologyWeight;

export const buildTopologyWeights = <TManifest extends StageTopologyManifest>(manifest: NoInfer<TManifest>): Readonly<Record<string, number>> => {
  const output: Record<string, number> = {};
  for (const edge of manifest) {
    const normalized = Number(String(edge.weight).replace(/^weight-/, ''));
    output[`${edge.from}->${edge.to}`] = Number.isFinite(normalized) ? normalized : 0;
  }
  return output;
};

export const pathFromTopology = <TManifest extends StageTopologyManifest>(manifest: TManifest): readonly StageTopologyNode[] => {
  const order = [...new Set([...manifest.map((edge) => edge.from), ...manifest.map((edge) => edge.to)])];
  return order.map((entry, depth) => ({ node: entry, depth }));
};

export const ensureTopology = <TManifest extends StageTopologyManifest>(manifest: TManifest): TManifest => {
  if (manifest.length === 0) {
    return manifest;
  }
  for (const edge of manifest) {
    if (!edge.from || !edge.to) {
      throw new Error(`topology.invalid:${edge.from}->${edge.to}`);
    }
  }
  return manifest;
};

export const runTopology = <TManifest extends StageTopologyManifest>(manifest: TManifest): readonly `stage.${string}`[] => {
  const seen = new Set<string>();
  const output: `stage.${string}`[] = [];
  for (const edge of manifest) {
    for (const next of [edge.from, edge.to]) {
      if (!seen.has(next)) {
        seen.add(next);
        output.push(next as `stage.${string}`);
      }
    }
  }
  return output;
};

export const walkTopology = <TManifest extends StageTopologyManifest>(manifest: TManifest): IterableIterator<`stage.${string}`> => {
  const path = runTopology(manifest);
  return (function* (): IterableIterator<`stage.${string}`> {
    for (const stage of path) {
      yield stage;
    }
  })();
};

export const mapTopologyLayers = <TManifest extends StageTopologyManifest>(
  manifest: TManifest,
): readonly StageLayer[] => {
  const edges = runTopology(manifest);
  const groups = Math.max(1, Math.ceil(edges.length / 3));
  return Array.from({ length: groups }, (_, index) => {
    const start = index * 3;
    return edges.slice(start, start + 3).map((entry) => entry as never) as StageLayer;
  });
};

export const resolveLayer = (manifest: StageTopologyManifest, layer: number): StageLayer => {
  const path = runTopology(manifest);
  const start = Math.max(0, layer * 3);
  return path.slice(start, start + 3).map((entry) => entry as `stage.${string}`) as StageLayer;
};

export const normalizeTopologyWeights = <TManifest extends StageTopologyManifest>(manifest: TManifest): StageTopologyManifest =>
  manifest.toSorted((left, right) => String(right.weight).localeCompare(String(left.weight))) as StageTopologyManifest;

export const buildTopologyGraph = <TStage extends readonly string[]>(
  stages: TStage,
): readonly StageTopologyEdge[] =>
  stages.toSorted().flatMap((stage, index) => {
    const from = normalizeStage(stage);
    return stages
      .slice(index + 1)
      .map((target) => ({
        from,
        to: normalizeStage(target),
        weight: edgeWeight(index + 1),
        channel: `topology.${from}` as const,
      }));
  }) as StageTopologyManifest;

export const analyzeTopology = (manifest: StageTopologyManifest): {
  readonly nodes: readonly `stage.${string}`[];
  readonly edges: number;
  readonly maxDepth: number;
} => {
  const nodes = runTopology(manifest);
  const maxDepth = nodes.length;
  return {
    nodes,
    edges: manifest.length,
    maxDepth,
  };
};

export const chunkTopology = (manifest: StageTopologyManifest, size: number): readonly StageTopologyManifest[] => {
  if (size <= 0) {
    return [];
  }
  const snapshot = normalizeTopologyWeights(ensureTopology(manifest));
  const output: StageTopologyManifest[] = [];
  for (let cursor = 0; cursor < snapshot.length; cursor += size) {
    output.push(snapshot.slice(cursor, cursor + size));
  }
  return output;
};

export const createPathVector = (stages: readonly string[]): string => {
  const history = [...stages].toSorted();
  return history.join('>');
};

export const buildTopologyPathFromOrder = <TStage extends readonly (string | `stage.${string}`)[]>(
  ordered: TStage,
  label: string,
): StageTopologyManifest =>
  ordered.map((stage, index) => ({
    from: normalizeStage(stage as string),
    to: normalizeStage(ordered[Math.min(index + 1, ordered.length - 1)] as string),
    weight: `${Math.max(1, index + 1)}` as StageTopologyWeight,
    channel: `topology.${label}` as const,
  })).filter((entry): entry is StageTopologyEdge => entry.to !== (entry.from as string));

export const runTopologyAsync = async <TValue extends { readonly at: string }>(
  manifest: StageTopologyManifest,
  source: AsyncLikeIterable<TValue>,
): Promise<readonly string[]> => {
  const values = mapAsync(source, async (entry, index) => ({
    index,
    stage: (entry as TValue).at,
  }));
  const rows: string[] = [];
  for await (const row of values) {
    rows.push(`${row.index}::${row.stage}`);
  }
  return rows;
};

export const buildTopologySignature = (manifest: StageTopologyManifest): string =>
  manifest
    .map((entry) => `${entry.from}${entry.to}${entry.weight}`)
    .toSorted()
    .join('|');
