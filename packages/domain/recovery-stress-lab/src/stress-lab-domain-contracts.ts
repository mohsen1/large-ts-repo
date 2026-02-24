import {
  type TenantId,
  type StageSignal,
  type WorkloadTopology,
  type WorkloadId,
  createSignalId,
  type RecoverySignalId,
  type SeverityBand,
  type RecoverySignal,
} from './models';
import { type NoInfer } from '@shared/type-level';

export type CanonicalRoute<TPrefix extends string, TSuffix extends string> = `${TPrefix}/${TSuffix}`;
export type RouteSegment = `${string}/${string}`;
export type SplitRoute<TInput extends RouteSegment> = readonly string[];

export type JoinSegments<TSegments extends readonly string[]> = TSegments extends readonly [infer Head, ...infer Rest]
  ? Head extends string
    ? Rest extends readonly string[]
      ? Rest extends []
        ? Head
        : `${Head}/${JoinSegments<Rest & readonly string[]>}`
      : never
    : never
  : never;

export type BrandedRoute<TPrefix extends string> = TPrefix & { readonly __brand: 'DomainRoute' };

export type StageRouteRegistry<TRoutes extends readonly string[]> = {
  [K in TRoutes[number]]: {
    readonly route: K;
    readonly segments: SplitRoute<RouteSegment>;
  };
};

export type NormalizedSignal<TSignal extends Pick<StageSignal, 'signal' | 'signalClass' | 'severity' | 'source'> > = Readonly<{
  readonly id: StageSignal['signal'];
  readonly signalClass: StageSignal['signalClass'];
  readonly severity: SeverityBand;
  readonly source: StageSignal['source'];
  readonly key: `${StageSignal['signalClass']}:${SeverityBand}`;
}>;

export interface DomainSignalEnvelope {
  readonly tenantId: TenantId;
  readonly signals: readonly RecoverySignal[];
  readonly signalMap: StageRouteRegistry<`signal/${string}`[]>;
}

export type SignalBucket<TBuckets extends readonly string[], TSignals extends readonly StageSignal[]> = {
  readonly [K in TBuckets[number]]: ReadonlyArray<Extract<TSignals[number], { readonly signalClass: K }>>;
};

type NormalizePhase<TInput extends string> = TInput extends 'low' | 'medium' | 'high' | 'critical' ? TInput : never;

export type BandedSignal<TBand extends string> = StageSignal & {
  readonly band: NormalizePhase<TBand>;
};

export const asBrandedRoute = <TRoute extends string>(route: TRoute): BrandedRoute<TRoute> => {
  return route as BrandedRoute<TRoute>;
};

export const parseRouteSegments = <TRoute extends RouteSegment>(route: TRoute): SplitRoute<TRoute> => {
  return route
    .split('/')
    .filter(Boolean) as SplitRoute<TRoute>;
};

const canonicalizeSegment = (segment: string): string => segment.trim().toLowerCase().replace(/\s+/g, '-');

export const normalizeRoute = <TInput extends RouteSegment>(route: TInput): RouteSegment => {
  const [head, ...tail] = parseRouteSegments(route);
  const [first, ...rest] = [head, ...tail].filter((entry) => entry.length > 0);
  const normalized = [first ? canonicalizeSegment(first) : 'signal', ...rest.map((entry) => canonicalizeSegment(entry))];
  if (normalized.length < 2) {
    return `signal/${normalized[0] ?? 'signal'}` as RouteSegment;
  }
  return `${normalized[0]}/${normalized.slice(1).join('/')}` as RouteSegment;
};

export const mapSignalsByClass = <TSignals extends readonly StageSignal[]>(signals: TSignals): StageRouteRegistry<`signal/${string}`[]> => {
  const map = {} as StageRouteRegistry<`signal/${string}`[]>;
  for (const signal of signals) {
    const route = `signal/${signal.signalClass}` as const;
    map[asBrandedRoute(route)] = {
      route,
      segments: parseRouteSegments(route as RouteSegment),
    };
  }

  return map;
};

export const rankBySignalClass = <TSignals extends readonly StageSignal[]>(signals: TSignals): readonly NormalizedSignal<TSignals[number]>[] => {
  const sorted = signals.toSorted((left, right) => {
    if (left.severity === right.severity) {
      return left.signal.localeCompare(right.signal);
    }
    if (left.severity === 'critical') return -1;
    if (right.severity === 'critical') return 1;
    if (left.severity === 'high') return -1;
    if (right.severity === 'high') return 1;
    return left.signal.localeCompare(right.signal);
  });

  return sorted.map((entry) => ({
    id: entry.signal,
    signalClass: entry.signalClass,
    severity: entry.severity,
    source: entry.source,
    key: `${entry.signalClass}:${entry.severity}` as const,
  }));
};

export const bundleTopology = <TTopology extends WorkloadTopology>(topology: TTopology): DomainTopologyDigest => {
  const edgeDigest = topology.edges
    .map((edge) => `${edge.from}->${edge.to}`)
    .toSorted()
    .join('|');
  const nodeDigest = topology.nodes
    .map((node) => `${node.id}:${node.active ? 'active' : 'inactive'}`)
    .toSorted()
    .join('|');
  const combined = [topology.tenantId, edgeDigest, nodeDigest].join('::');

  return {
    tenantId: topology.tenantId,
    nodeCount: topology.nodes.length,
    edgeCount: topology.edges.length,
    digest: combined,
    activeNodeIds: topology.nodes.filter((node) => node.active).map((node) => node.id),
  };
};

export interface DomainTopologyDigest {
  readonly tenantId: TenantId;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly digest: string;
  readonly activeNodeIds: readonly WorkloadId[];
}

export interface EnrichedTopologyInput {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly phase: 'observe' | 'isolate' | 'migrate' | 'restore' | 'verify' | 'standdown';
}

export interface EnrichedTopologyDigest extends DomainTopologyDigest {
  readonly phaseTag: `phase:${'observe' | 'isolate' | 'migrate' | 'restore' | 'verify' | 'standdown'}`;
  readonly topologySource: RecoverySignalId;
}

export const enrichTopologyDigest = <TTopology extends EnrichedTopologyInput>(input: TTopology): EnrichedTopologyDigest => {
  const base = bundleTopology(input.topology);
  return {
    ...base,
    phaseTag: `phase:${input.phase}` as const,
    topologySource: createSignalId(`${input.tenantId}:${input.phase}:${base.digest}`),
  };
};

export interface SignalDistribution {
  readonly byClass: Record<string, readonly RecoverySignal[]>;
  readonly labels: readonly string[];
}

export const snapshotSignalDistribution = <TSignals extends readonly RecoverySignal[]>(
  tenantId: NoInfer<TenantId>,
  signals: TSignals,
): SignalDistribution => {
  const byClass = signals.reduce<Record<string, RecoverySignal[]>>((acc, signal) => {
    const current = acc[signal.class] ?? [];
    current.push(signal);
    acc[signal.class] = current;
    return acc;
  }, {});

  const labels = Object.keys(byClass)
    .map((key) => `${tenantId}:${key}`)
    .toSorted();

  return {
    byClass,
    labels: labels as readonly string[],
  };
};
