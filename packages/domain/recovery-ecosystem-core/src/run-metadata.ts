import { createHash } from 'node:crypto';
import type { JsonValue } from '@shared/type-level';
import type { NamespaceTag, RunId, TenantId } from './identifiers';
import type { EcosystemMetric, LifecyclePhase, RecoveryRun } from './models';

interface RunEventEnvelope {
  readonly event: `event:${string}`;
  readonly namespace: NamespaceTag;
  readonly at: string;
  readonly stageId?: `stage:${string}`;
}

type FlattenPayload<TPayload> = TPayload extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...FlattenPayload<Tail>]
  : readonly [];

export type MetricTuple<TValues extends readonly EcosystemMetric[]> = FlattenPayload<TValues>;

type EventSuffix<TEvent extends string> = TEvent extends `event:${infer Suffix}` ? Suffix : never;

export interface RunMetadata<TPayload extends JsonValue = JsonValue> {
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly timeline: readonly RunEventEnvelope[];
  readonly score: number;
  readonly payload: TPayload;
}

export type EventEnvelopeByPhase<TPhase extends LifecyclePhase = LifecyclePhase> = {
  readonly phase: TPhase;
  readonly events: readonly RunEventEnvelope[];
};

export interface MetadataBundle<TPayload extends JsonValue = JsonValue> {
  readonly metadata: RunMetadata<TPayload>;
  readonly metricSummary: MetricSummary;
  readonly orderedEvents: readonly EventEnvelopeByPhase[];
}

export interface MetricSummary {
  readonly count: number;
  readonly uniqueNamespaces: number;
  readonly totalPayloadBytes: number;
  readonly signature: string;
}

type MetricInput = {
  readonly run: RecoveryRun;
  readonly timeline: readonly RunEventEnvelope[];
};

const bootstrapEvents: readonly RunEventEnvelope[] = [
  {
    event: 'event:boot',
    namespace: 'namespace:global' as NamespaceTag,
    at: new Date().toISOString(),
    stageId: 'stage:bootstrap' as `stage:${string}`,
  },
  {
    event: 'event:seed',
    namespace: 'namespace:global' as NamespaceTag,
    at: new Date().toISOString(),
    stageId: 'stage:seed' as `stage:${string}`,
  },
];

const normalizeEvents = (events: readonly RunEventEnvelope[]): readonly RunEventEnvelope[] =>
  events.toSorted((left, right) => left.at.localeCompare(right.at));

const groupBySuffix = (events: readonly RunEventEnvelope[]): Record<string, readonly RunEventEnvelope[]> => {
  const grouped: Record<string, RunEventEnvelope[]> = {};
  for (const event of events) {
    const suffix = event.event.replace(/^event:/, '') as EventSuffix<typeof event.event>;
    const current = grouped[suffix] ?? [];
    grouped[suffix] = [...current, event];
  }
  return grouped as Record<string, readonly RunEventEnvelope[]>;
};

const signatureFor = (value: string): string => {
  const hash = createHash('sha1');
  hash.update(value);
  return hash.digest('hex').slice(0, 16);
};

const signatureOf = (value: RecoveryRun): string => {
  const count = value.plan.phases.length;
  return signatureFor(`${value.id}:${value.phase}:${count}`);
};

export const defaultEventKinds = bootstrapEvents.map((entry) => entry.event) as readonly `event:${string}`[];

export const buildRunMetadata = <TPayload extends JsonValue = JsonValue>(input: MetricInput): MetadataBundle<TPayload> => {
  const ordered = normalizeEvents(input.timeline);
  const grouped = groupBySuffix(ordered);

  const metricSummary: MetricSummary = {
    count: ordered.length,
    uniqueNamespaces: new Set(input.run.plan.phases.map((phase) => String(phase.id))).size,
    totalPayloadBytes: JSON.stringify(input.run).length + JSON.stringify(ordered).length,
    signature: signatureOf(input.run),
  };

  const orderedEvents = Object.entries(grouped).map(([suffix, events]) => {
    const phase = (suffix.includes('rollback') ? 'rollback' : 'running') as LifecyclePhase;
    return {
      phase,
      events,
    } as EventEnvelopeByPhase<LifecyclePhase>;
  });

  return {
    metadata: {
      runId: input.run.id,
      tenant: input.run.tenant,
      namespace: input.run.namespace,
      timeline: ordered,
      score: input.run.warnings.length,
      payload: JSON.parse(JSON.stringify(input.run)) as TPayload,
    },
    metricSummary,
    orderedEvents,
  };
};

export const toMetricTuple = <TMetrics extends readonly EcosystemMetric[]>(metrics: TMetrics): MetricTuple<TMetrics> =>
  metrics as unknown as MetricTuple<TMetrics>;

export const normalizeRunEvent = (input: UnknownRunEvent | RunEventEnvelope): RunEventEnvelope => {
  return {
    event: (input.event.startsWith('event:') ? input.event : `event:${input.event}`) as `event:${string}`,
    namespace: input.namespace,
    at: input.at,
    stageId: input.stageId,
  };
};

interface UnknownRunEvent {
  readonly event: string;
  readonly namespace: NamespaceTag;
  readonly at: string;
  readonly stageId?: `stage:${string}`;
}
