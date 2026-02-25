import { Brand } from '@shared/core';
import type { SignalEvent, StrategyMode, StrategyLane, StrategyTuple } from './types';

export const latticePhases = ['capture', 'normalize', 'rank', 'execute', 'review'] as const;
export const laneCaps = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;

export type LatticePhase = (typeof latticePhases)[number];
export type LatticeLane = (typeof laneCaps)[number];

export type LatticeMatrix<TData> = { readonly [K in LatticeLane]: readonly TData[] };
export type ModeRoute = `${StrategyMode}::${LatticePhase}`;
export type RouteSeed<T extends string = string> = `${T}::${string}`;

export type BrandedTag<TPrefix extends string> = Brand<string, `${TPrefix}Tag`>;
export type PluginNamespace<TPrefix extends string> = `${TPrefix}/${StrategyMode | LatticePhase}`;

export type RebindKeys<TRecord> = {
  [K in keyof TRecord as K extends `raw${infer Tail}` ? `clean${Capitalize<Tail>}` : `src${K & string}`]: TRecord[K];
};

export type PathSegment<TPrefix extends string> = `${TPrefix}:${string}`;

export type RecursiveTupleShape<
  T extends readonly unknown[],
  Acc extends readonly unknown[] = readonly [],
> = T extends readonly [infer Head, ...infer Tail] ? RecursiveTupleShape<Tail, readonly [...Acc, Head]> : Acc;

export type RecursiveTail<T extends readonly unknown[]> = T extends readonly [infer _Head, ...infer Tail] ? Tail : readonly [];

export type MapSeverityToLane<TSeverity extends SignalEvent['severity']> =
  TSeverity extends 'info'
    ? 'forecast'
    : TSeverity extends 'warn'
      ? 'recovery'
      : TSeverity extends 'error'
        ? 'containment'
        : TSeverity extends 'critical'
          ? 'assurance'
          : TSeverity extends 'fatal'
            ? 'assurance'
            : 'forecast';

export type EventByRoute<
  TEvents extends readonly SignalEvent[],
> = {
  [K in TEvents[number] as `${K['source']}/${K['severity']}`]: K;
};

export type LaneCount = { readonly [K in LatticeLane]: number };
export type LatticeNode<TPayload> = Readonly<{
  readonly id: Brand<string, 'LatticeNode'>;
  readonly phase: LatticePhase;
  readonly lane: LatticeLane;
  readonly route: `${LatticeLane}:${number}`;
  readonly mode: StrategyMode;
  readonly payload: TPayload;
}>;

export interface LatticeRunSummary {
  readonly route: ModeRoute;
  readonly lane: `${LatticeLane}:${number}`;
  readonly mode: StrategyMode;
  readonly score: number;
  readonly warnings: number;
  readonly errors: number;
}

export type NodeBundle<TNodes extends readonly LatticeNode<unknown>[]> = {
  readonly nodes: TNodes;
  readonly route: RouteSeed<TNodes[number]['mode']>;
  readonly map: RebindKeys<Record<string, unknown>>;
};

export const latticeSeed = [
  ...latticePhases.map((phase, index) => ({
    phase,
    lane: laneCaps[index % laneCaps.length],
    mode: latticePhases[index % latticePhases.length] as StrategyMode,
    route: `${laneCaps[index % laneCaps.length]}::${phase}` as `seed:${string}`,
  })),
] as const satisfies readonly {
  readonly phase: LatticePhase;
  readonly lane: LatticeLane;
  readonly mode: StrategyMode;
  readonly route: `seed:${string}`;
}[];

export const foldNodesByPhase = <TNodes extends readonly LatticeNode<unknown>[]>(nodes: TNodes): LatticeMatrix<TNodes[number]> => {
  const matrix = {
    forecast: [] as readonly TNodes[number][],
    resilience: [] as readonly TNodes[number][],
    containment: [] as readonly TNodes[number][],
    recovery: [] as readonly TNodes[number][],
    assurance: [] as readonly TNodes[number][],
  } as LatticeMatrix<TNodes[number]>;

  return nodes.reduce<LatticeMatrix<TNodes[number]>>((acc, node) => {
    return {
      ...acc,
      [node.lane]: [...acc[node.lane], node],
    };
  }, matrix);
};

export const deriveSeverityFromScore = (score: number): SignalEvent['severity'] => {
  if (score >= 0.9) return 'fatal';
  if (score >= 0.75) return 'critical';
  if (score >= 0.5) return 'error';
  if (score >= 0.25) return 'warn';
  return 'info';
};

export const laneFromSeverity = <TSeverity extends SignalEvent['severity']>(
  severity: TSeverity,
): MapSeverityToLane<TSeverity> => {
  if (severity === 'info') {
    return 'forecast' as MapSeverityToLane<TSeverity>;
  }
  if (severity === 'warn') {
    return 'recovery' as MapSeverityToLane<TSeverity>;
  }
  if (severity === 'error') {
    return 'containment' as MapSeverityToLane<TSeverity>;
  }
  if (severity === 'critical' || severity === 'fatal') {
    return 'assurance' as MapSeverityToLane<TSeverity>;
  }
  return 'forecast' as MapSeverityToLane<TSeverity>;
};

export const toNode = <TPayload>(
  mode: StrategyMode,
  lane: LatticeLane,
  phase: LatticePhase,
  payload: TPayload,
): LatticeNode<TPayload> => {
  const route = `${lane}:${Math.floor(Math.random() * 10_000)}` as `${LatticeLane}:${number}`;
  return {
    id: `${mode}::${phase}::${lane}` as Brand<string, 'LatticeNode'>,
    phase,
    lane,
    route,
    mode,
    payload,
  };
};

export const buildSummaryFromNodes = <TNodes extends readonly LatticeNode<unknown>[]>(nodes: TNodes): LatticeRunSummary => {
  const [first] = nodes;
  const warnings = Math.max(0, nodes.length - 1);
  const score = 1 / (nodes.length + 1);
  return {
    route: `${first?.mode ?? 'simulate'}::${first?.phase ?? 'capture'}`,
    lane: `${first?.lane ?? 'forecast'}:${nodes.length}`,
    mode: first?.mode ?? 'simulate',
    score,
    warnings,
    errors: Math.max(0, nodes.length - warnings),
  };
};

export const sequenceFromSeed = <T>(seed: readonly T[]): readonly [T, ...T[]] => {
  return seed.length === 0 ? ([] as unknown as readonly [T, ...T[]]) : ([seed[0], ...seed.slice(1)] as readonly [T, ...T[]]);
};

export const recursiveTuple = <T extends readonly unknown[]>(tuple: T): RecursiveTupleShape<T> =>
  tuple as unknown as RecursiveTupleShape<T>;

export const tailTuple = <T extends readonly unknown[]>(tuple: T): RecursiveTail<T> => tuple.slice(1) as RecursiveTail<T>;
