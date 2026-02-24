import {
  IntentTelemetryBus,
  type IntentTelemetryBucket,
  createTelemetryBus,
  telemetryFromContext,
  normalizeBucketCount,
  type IntentTelemetryEvent,
} from '@domain/recovery-incident-intent';
import type { IncidentContext } from '@domain/recovery-incident-intent';

export interface OrchestratorTelemetry {
  readonly tenantId: string;
  readonly eventCount: number;
  readonly statusBuckets: readonly IntentTelemetryBucket[];
  readonly normalizedScore: number;
}

export class OrchestratorTelemetryCollector {
  readonly #bus: IntentTelemetryBus;

  constructor(tenantId: string) {
    this.#bus = createTelemetryBus(tenantId);
  }

  emit(
    stage: string,
    status: 'queued' | 'running' | 'blocked' | 'succeeded' | 'degraded' | 'failed',
    context: IncidentContext,
  ): void {
    this.#bus.emit(stage, 'orchestration', status, telemetryFromContext(context));
  }

  snapshot(): OrchestratorTelemetry {
    const buckets = this.#bus.buckets();
    return {
      tenantId: 'all',
      eventCount: normalizeBucketCount(buckets),
      statusBuckets: buckets,
      normalizedScore: this.#bus.topEvents().length,
    };
  }

  top(): readonly IntentTelemetryEvent[] {
    return this.#bus.topEvents();
  }

  clear(): void {
    this.#bus.clear();
  }

  [Symbol.dispose](): void {
    this.#bus[Symbol.dispose]();
  }
}
