import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import { z } from 'zod';
import { NoInfer } from '@shared/type-level';
import type { Brand } from '@shared/core';
import type {
  MeshNodeContract,
  MeshPlanId,
  MeshRunId,
  MeshSignalKind,
  MeshTopology,
  MeshTopologyEdge,
  MeshPath,
} from '../types';

export type MetricBrand<T extends string> = Brand<string, `mesh-metric-${T}`>;
export type MetricDimension<T extends string> = `${T}:dimension:${string}`;
export type MetricNamespace<T extends string = string> = `mesh:${T}`;
export type MetricPath = readonly [MeshPath, ...string[]];

export interface MetricPoint<TName extends string = string, TUnit extends string = string> {
  readonly metric: MetricDimension<TName>;
  readonly unit: TUnit;
  readonly value: number;
  readonly at: number;
}

export interface MetricSeries<TName extends string = string, TUnit extends string = string> {
  readonly id: MetricBrand<TName>;
  readonly namespace: MetricNamespace<TName>;
  readonly points: readonly MetricPoint<TName, TUnit>[];
  readonly labels: readonly `${string}:${string}`[];
}

export type ObservabilityTuple<T extends readonly string[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? [Head, ...ObservabilityTuple<Extract<Tail, readonly string[]>>]
      : []
    : [];

export type MetricEnvelopeKey<T extends string, TUnits extends readonly string[]> =
  `${T}[${TUnits[number]}]`;

export type MetricNameUnion<TNames extends readonly string[]> =
  TNames[number] extends infer Name
    ? Name extends string
      ? `metric:${Name}`
      : never
    : never;

export type MetricBucketName<TPath extends string> = `bucket.${TPath}`;

export type MetricBuckets<TPath extends readonly string[]> = {
  readonly [K in ObservabilityTuple<TPath>[number] as MetricBucketName<Extract<K, string>>]:
    readonly MetricPoint<string>[];
};

type MetricBucketState<TPath extends readonly string[]> = {
  -readonly [K in keyof MetricBuckets<TPath>]: MetricPoint<string>[];
};

export type HealthWindow<TSignals extends readonly MeshSignalKind[]> = {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly labels: readonly `window:${TSignals[number] & string}`[];
  readonly at: number;
  readonly sampleCount: number;
};

export type RecursiveMetricTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveMetricTuple<Tail>]
  : readonly [];

export interface HealthSignal {
  readonly severity: 'low' | 'normal' | 'high' | 'critical';
  readonly reason: string;
}

export interface MeshObservabilityAlert {
  readonly id: Brand<string, 'mesh-observability-alert'>;
  readonly signal: MeshSignalKind;
  readonly title: string;
  readonly details: string;
  readonly score: number;
  readonly trace: readonly string[];
}

export type AlertPolicy<TAlert extends MeshObservabilityAlert = MeshObservabilityAlert> =
  | { readonly mode: 'strict'; readonly policy: readonly TAlert[]; readonly emitCritical: true }
  | { readonly mode: 'balanced'; readonly policy: readonly TAlert[]; readonly emitCritical: false }
  | { readonly mode: 'lax'; readonly policy: readonly TAlert[]; readonly emitCritical: false };

export interface TopologyHealthProfile {
  readonly topologyId: MeshPlanId;
  readonly nodeCount: number;
  readonly linkedCount: number;
  readonly cycleRisk: number;
  readonly staleNodeIds: readonly MeshNodeContract['id'][];
  readonly hotPaths: readonly MeshTopologyEdge[];
}

export interface ObservabilityRunContext {
  readonly runId: MeshRunId;
  readonly tenantId: Brand<string, 'mesh-observability-tenant'>;
  readonly namespace: `mesh.observability.${string}`;
  readonly startedAt: number;
}

export interface ObservabilitySeriesRequest {
  readonly path: MeshPath;
  readonly kind: MeshSignalKind;
  readonly values: readonly Readonly<Record<string, number>>[];
  readonly labels: readonly string[];
}

const metricSeriesInputSchema = z.object({
  metric: z.string().min(3).max(200),
  labels: z.array(z.string()),
  unit: z.string(),
  values: z.array(
    z.object({
      metric: z.string(),
      unit: z.string(),
      value: z.number().finite(),
      at: z.number().nonnegative(),
    }),
  ),
});

export const parseMetricSeries = (value: unknown): MetricSeries => {
  const parsed = metricSeriesInputSchema.parse(value);
  const id = withBrand(
    `${parsed.metric}-${parsed.unit}-${Date.now()}-${Math.random().toString(36)}`,
    `mesh-metric-${parsed.metric}`,
  );

  return {
    id,
    namespace: `mesh:${parsed.metric}` as const,
    points: parsed.values.map((point) => ({
      metric: `${parsed.metric}:dimension:${point.unit}`,
      unit: point.unit,
      value: point.value,
      at: point.at,
    })) as readonly MetricPoint<string, string>[],
    labels: parsed.labels.map((label) => `label:${label}` as const),
  };
}

export const computeHealthWindowSignature = <TSources extends readonly MeshSignalKind[]>(
  sources: NoInfer<TSources>,
): readonly `signature:${TSources[number]}`[] => {
  return sources.map((source) => `signature:${source}` as const);
};

export const buildHealthSignal = (
  runId: MeshRunId,
  planId: MeshPlanId,
  severity: HealthSignal['severity'],
  reason: string,
): MeshObservabilityAlert => ({
  id: withBrand(`${planId}:${runId}:${reason}:${Date.now()}`, 'mesh-observability-alert'),
  signal: severity === 'critical' ? 'alert' : 'telemetry',
  title: reason,
  details: `${runId} observed ${severity}`,
  score: severity === 'critical' ? 95 : severity === 'high' ? 75 : severity === 'normal' ? 50 : 20,
  trace: [runId, planId, reason],
});

export const buildProfileFromTopology = (topology: MeshTopology): TopologyHealthProfile => {
  const linkTargets = new Set<MeshTopologyEdge['to']>();
  for (const link of topology.links) {
    linkTargets.add(link.to);
  }

  const staleNodes = topology.nodes
    .filter((node) => !linkTargets.has(node.id))
    .map((node) => node.id);

  const hotPaths = topology.links
    .filter((link) => link.weight > 0.7)
    .toSorted((left, right) => right.weight - left.weight);

  const cycleRisk = Math.min(
    100,
    topology.nodes.length === 0
      ? 0
      : Math.round(
          ((topology.links.length - topology.nodes.length + 1) / Math.max(1, topology.nodes.length)) * 100,
        ),
  );

  return {
    topologyId: topology.id,
    nodeCount: topology.nodes.length,
    linkedCount: linkTargets.size,
    cycleRisk,
    staleNodeIds: staleNodes,
    hotPaths,
  };
};

export const pickCriticalSignals = <T extends readonly MeshObservabilityAlert[]>(
  alerts: T,
): Extract<T[number], { score: 90 | 95 | number }>[] => {
  return alerts.filter(
    (alert): alert is Extract<T[number], { score: 90 | 95 | number }> => alert.score >= 90,
  );
};

export const bucketizeMetrics = <TMetric extends readonly MetricPoint[]>(
  metrics: NoInfer<TMetric>,
): MetricBuckets<['throughput', 'latency', 'reliability']> => {
  const buckets: MetricBucketState<['throughput', 'latency', 'reliability']> = {
    'bucket.throughput': [],
    'bucket.latency': [],
    'bucket.reliability': [],
  };

  for (const metric of metrics) {
    const key: keyof MetricBucketState<['throughput', 'latency', 'reliability']> = metric.metric.includes('latency')
      ? 'bucket.latency'
      : metric.metric.includes('reliability')
        ? 'bucket.reliability'
        : 'bucket.throughput';
    buckets[key] = [...buckets[key], metric];
  }

  return buckets as MetricBuckets<['throughput', 'latency', 'reliability']>;
};

export const mergeSeries = <TLeft extends readonly MetricSeries[], TRight extends readonly MetricSeries[]>(
  left: NoInfer<TLeft>,
  right: NoInfer<TRight>,
): readonly [...TLeft, ...TRight] => {
  return [...left, ...right] as const;
};

export interface TopologyPathIterator {
  readonly tokens: RecursiveMetricTuple<['mesh', 'path', 'step']>;
}

export const createTopologyPathIterator = (): TopologyPathIterator => {
  const steps = ['mesh', 'path', 'step'] as const;
  return { tokens: steps };
};

export const asObservationId = (planId: MeshPlanId, runId: MeshRunId): Brand<string, 'mesh-observability-observation'> =>
  withBrand(`${planId}-${runId}-${randomUUID()}`, 'mesh-observability-observation');

export const isHighRiskProfile = (value: TopologyHealthProfile): boolean => value.cycleRisk >= 70;

export const policyToSignals = <TPolicy extends AlertPolicy>(
  policy: NoInfer<TPolicy>,
): TPolicy['policy'] => {
  return policy.policy;
};

export const summarizeProfile = (profile: TopologyHealthProfile): Readonly<TopologyHealthProfile> => ({
  ...profile,
  staleNodeIds: [...profile.staleNodeIds],
  hotPaths: [...profile.hotPaths],
});

export const normalizeNodePath = <T extends readonly MeshPath[]>(
  nodes: NoInfer<T>,
): MeshPath[] => nodes.map((node) => node as MeshPath);

export const profileMetricsEnvelope = (profile: TopologyHealthProfile) => ({
  topologyId: profile.topologyId,
  score: 100 - Math.min(100, profile.cycleRisk + profile.staleNodeIds.length),
  staleNodeIds: profile.staleNodeIds,
  hotPaths: profile.hotPaths,
});
