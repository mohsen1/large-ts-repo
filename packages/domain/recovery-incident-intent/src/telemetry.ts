import {
  createIncidentTenantId,
  type IncidentTenantId,
  type IncidentContext,
  type IncidentIntentManifest,
  type IntentPhase,
  type IntentStatus,
} from './types';

export interface IntentTelemetryEvent {
  readonly namespace: 'recovery-incident-intent';
  readonly tenantId: IncidentTenantId;
  readonly event: string;
  readonly phase: IntentPhase;
  readonly status: IntentStatus;
  readonly createdAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface IntentTelemetryBucket {
  readonly minute: string;
  count: number;
  byStatus: Record<IntentStatus, number>;
}

export interface IntentTelemetryBusOptions {
  readonly tenantId: IncidentTenantId;
  readonly windowSizeMs?: number;
}

type EventHandler = (event: IntentTelemetryEvent) => void;

const toMinute = (value: string): string => value.slice(0, 16);

export class IntentTelemetryBus {
  readonly #entries: IntentTelemetryEvent[] = [];
  readonly #subscribers = new Map<string, Set<EventHandler>>();
  readonly #options: Readonly<IntentTelemetryBusOptions>;

  constructor(options: IntentTelemetryBusOptions) {
    this.#options = {
      windowSizeMs: 60_000,
      ...options,
    };
  }

  emit(event: string, phase: IntentPhase, status: IntentStatus, payload: Readonly<Record<string, unknown>>): void {
    const telemetry: IntentTelemetryEvent = {
      namespace: 'recovery-incident-intent',
      tenantId: this.#options.tenantId,
      event,
      phase,
      status,
      createdAt: new Date().toISOString(),
      payload,
    };
    this.#entries.push(telemetry);
    this.#notify(event, telemetry);
  }

  on(event: string, handler: EventHandler): { [Symbol.dispose](): void } {
    const current = this.#subscribers.get(event) ?? new Set<EventHandler>();
    current.add(handler);
    this.#subscribers.set(event, current);
    return {
      [Symbol.dispose]: () => {
        current.delete(handler);
      },
    };
  }

  #notify(event: string, payload: IntentTelemetryEvent): void {
    const handlers = this.#subscribers.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  buckets(): readonly IntentTelemetryBucket[] {
    const now = Date.now();
    const cutoff = now - (this.#options.windowSizeMs ?? 60_000);
    const buckets = new Map<string, IntentTelemetryBucket>();

    for (const entry of this.#entries) {
      const timestamp = new Date(entry.createdAt).getTime();
      if (timestamp < cutoff) continue;
      const minute = toMinute(entry.createdAt);
      const bucket = buckets.get(minute) ?? {
        minute,
        count: 0,
        byStatus: {
          queued: 0,
          running: 0,
          blocked: 0,
          succeeded: 0,
          degraded: 0,
          failed: 0,
        } as IntentTelemetryBucket['byStatus'],
      };
      bucket.count += 1;
      bucket.byStatus[entry.status] += 1;
      buckets.set(minute, bucket);
    }

    return [...buckets.values()];
  }

  aggregate(manifest: IncidentIntentManifest): IntentTelemetryBucket[] {
    const counts = new Map<string, IntentTelemetryBucket>();
    for (const entry of this.#entries) {
      if (entry.payload.manifestId !== manifest.catalogId) continue;
      const minute = toMinute(entry.createdAt);
      const bucket = counts.get(minute) ?? {
        minute,
        count: 0,
        byStatus: {
          queued: 0,
          running: 0,
          blocked: 0,
          succeeded: 0,
          degraded: 0,
          failed: 0,
        } as IntentTelemetryBucket['byStatus'],
      };
      bucket.count += 1;
      bucket.byStatus[entry.status] += 1;
      counts.set(minute, bucket);
    }

    return [...counts.values()];
  }

  topEvents(limit = 5): readonly IntentTelemetryEvent[] {
    return [...this.#entries].toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit);
  }

  clear(olderThan?: string): number {
    if (!olderThan) {
      const total = this.#entries.length;
      this.#entries.length = 0;
      return total;
    }
    const cutoff = new Date(olderThan).getTime();
    const remaining = this.#entries.filter((entry) => new Date(entry.createdAt).getTime() >= cutoff);
    const removed = this.#entries.length - remaining.length;
    this.#entries.length = 0;
    this.#entries.push(...remaining);
    return removed;
  }

  [Symbol.iterator](): IterableIterator<IntentTelemetryEvent> {
    return this.#entries[Symbol.iterator]();
  }

  [Symbol.dispose](): void {
    this.clear();
  }
}

export const createTelemetryBus = (tenantId: string): IntentTelemetryBus =>
  new IntentTelemetryBus({ tenantId: createIncidentTenantId(tenantId) });

export const telemetryFromContext = (context: IncidentContext): Record<string, unknown> => ({
  incidentId: context.incidentId,
  tenantId: context.tenantId,
  severity: context.severity,
  affectedSystems: context.affectedSystems,
  tagCount: context.tags.length,
});

export const normalizeBucketCount = (buckets: readonly IntentTelemetryBucket[]): number =>
  buckets.reduce((acc, bucket) => acc + bucket.count, 0);
