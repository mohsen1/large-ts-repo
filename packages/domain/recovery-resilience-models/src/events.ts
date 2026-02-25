import { z } from 'zod';
import { type MeshRoute, createRunId, type MeshRunId } from '@shared/recovery-ops-runtime';
import type { SeverityTier, ZoneCode, EventType, ScenarioId, TenantContext } from './ids';

export const resilienceEventSchema = z.object({
  version: z.string().min(3),
  eventId: z.string().uuid(),
  scenarioId: z.string().min(3),
  timestamp: z.string().datetime(),
  zone: z.enum(['zone-east', 'zone-west', 'zone-core']),
  route: z.string().min(2),
  type: z.enum(['drift', 'blast', 'depletion', 'throttle', 'saga']),
  severity: z.number().min(0).max(1),
  metrics: z.record(z.number()),
  payload: z.record(z.unknown()),
});

type ParsedResilienceEvent = z.infer<typeof resilienceEventSchema>;

export type ResilienceEvent = z.infer<typeof resilienceEventSchema> & {
  readonly type: EventType;
  readonly zone: ZoneCode;
  readonly route: MeshRoute;
  readonly severityLabel: SeverityTier;
};

export interface EventEnvelope<T extends ResilienceEvent = ResilienceEvent> {
  readonly event: T;
  readonly tags: readonly string[];
  readonly correlation: string;
}

export const eventToJson = (event: ResilienceEvent): string => JSON.stringify(event);

export const parseEvent = (input: unknown): ResilienceEvent => {
  const parsed = resilienceEventSchema.parse(input) as ParsedResilienceEvent;
  const severity = Number(parsed.severity);
  const score = Number(severity.toFixed(2));
  return {
    ...parsed,
    type: parsed.type as EventType,
    zone: parsed.zone as ZoneCode,
    route: parsed.route as MeshRoute,
    severityLabel: score > 0.7 ? 'critical' : score > 0.45 ? 'elevated' : 'low',
  };
};

export const sampleEvents = (count: number, scenarioId: ScenarioId): readonly ResilienceEvent[] => {
  return new Array(count).fill(0).map((_, index) => ({
    version: '1.0.0',
    eventId: `${scenarioId}-${index}`,
    scenarioId,
    timestamp: new Date(Date.now() + index * 500).toISOString(),
    zone: 'zone-east',
    route: 'analysis.edge',
    type: ['drift', 'blast', 'throttle', 'saga', 'depletion'][index % 5] as EventType,
    severity: index % 2 === 0 ? 0.32 : 0.91,
    metrics: {
      latency: 50 + index,
      throughput: 200 - index,
    },
    payload: {
      scenarioId,
      index,
    },
    severityLabel: index % 2 === 0 ? 'low' : 'critical',
  }));
};

export const groupByType = (events: readonly ResilienceEvent[]): Record<EventType, ResilienceEvent[]> => {
  const result = {
    drift: [],
    blast: [],
    depletion: [],
    throttle: [],
    saga: [],
  } as Record<EventType, ResilienceEvent[]>;

  for (const event of events) {
    const target = result[event.type];
    target.push(event);
  }

  return result;
};

export const rankEvents = (events: readonly ResilienceEvent[]): ResilienceEvent[] => {
  return [...events].sort((lhs, rhs) => rhs.severity - lhs.severity);
};
