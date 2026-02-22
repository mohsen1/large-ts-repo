import { RecoveryOperationsQueuePublisher, RecoveryOperationsQueueStats } from '@infrastructure/recovery-operations-queue';
import type { AnalyticsPublishContext } from './analytics-router';
import { publishAnalyticsBundle, buildPublishAdapters } from './analytics-router';
import type { OrchestrationEvent } from './orchestration-types';
import type { RecoverySignal, RunSession } from '@domain/recovery-operations-models';
import type { RecoveryOperationsEnvelope } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

export interface QueueServiceConfig {
  readonly signalQueueUrl: string;
  readonly region?: string;
  readonly source?: string;
}

export interface QueueService {
  publishSignals(signals: readonly RecoverySignal[]): Promise<readonly OrchestrationEvent[]>;
  publishRunArtifact(runId: string, tenant: string, artifact: unknown): Promise<OrchestrationEvent>;
  publishDecisionTelemetry(input: AnalyticsPublishContext, tenant: string, runId: string): Promise<OrchestrationEvent[]>;
  getStats(): { sent: number; failed: number; lastSeen: string };
}

export const publishDecisionTelemetry = async (
  input: AnalyticsPublishContext,
  tenant: string,
  runId: string,
): Promise<OrchestrationEvent[]> => {
  void tenant;
  void runId;
  const events = await publishAnalyticsBundle(input, buildPublishAdapters([]));
  return [
    {
      eventId: `${tenant}-${runId}-telemetry` as string,
      tenant: withBrand(tenant, 'TenantId'),
      kind: 'report',
      issuedAt: new Date().toISOString(),
      payload: events.report,
    },
    ...events.events,
  ];
};

interface QueueEnvelope<T> extends RecoveryOperationsEnvelope<T> {
  readonly tags?: readonly string[];
}

const normalizeTenant = (tenant: string): string => tenant;

export class IntelligenceQueueService implements QueueService {
  private readonly publisher: RecoveryOperationsQueuePublisher;
  private readonly stats: RecoveryOperationsQueueStats;

  constructor(config: QueueServiceConfig) {
    this.publisher = new RecoveryOperationsQueuePublisher({
      queueUrl: config.signalQueueUrl,
      region: config.region,
    });
    this.stats = new RecoveryOperationsQueueStats();
  }

  async publishSignals(signals: readonly RecoverySignal[]): Promise<readonly OrchestrationEvent[]> {
    const events: OrchestrationEvent[] = [];
    for (const signal of signals) {
      const tenant = normalizeTenant('recovery-tenant');
      const envelope: QueueEnvelope<RecoverySignal> = {
        eventId: `${tenant}-${Date.now()}`,
        tenant: withBrand(tenant, 'TenantId'),
        payload: signal,
        createdAt: new Date().toISOString(),
        tags: ['recovery-operations', 'signal'],
      };
      await this.publisher.publishPayload(envelope);
      this.stats.markSent();
      events.push({
        eventId: envelope.eventId,
        tenant: envelope.tenant,
        kind: 'signal',
        issuedAt: envelope.createdAt,
        payload: signal,
      });
    }
    return events;
  }

  async publishRunArtifact(runId: string, tenant: string, artifact: unknown): Promise<OrchestrationEvent> {
    const event: QueueEnvelope<unknown> = {
      eventId: `${tenant}-${runId}-artifact`,
      tenant: withBrand(tenant, 'TenantId'),
      payload: { runId, artifact },
      createdAt: new Date().toISOString(),
      tags: ['recovery-operations', 'artifact'],
    };
    await this.publisher.publishPayload(event);
    this.stats.markSent();
    return {
      eventId: event.eventId,
      tenant: event.tenant,
      kind: 'report',
      issuedAt: event.createdAt,
      payload: event.payload,
    };
  }

  async publishDecisionTelemetry(
    input: AnalyticsPublishContext,
    tenant: string,
    runId: string,
  ): Promise<OrchestrationEvent[]> {
    const envelopeSession: RecoveryOperationsEnvelope<AnalyticsPublishContext> = {
      eventId: `${tenant}-${runId}-analytics`,
      tenant: withBrand(tenant, 'TenantId'),
      payload: input,
      createdAt: new Date().toISOString(),
    };

    await this.publisher.publishPayload(envelopeSession);
    this.stats.markSent();

    const events = await publishAnalyticsBundle(input, buildPublishAdapters([]));
    return [
      {
        eventId: events.report.tenant,
        tenant: withBrand(tenant, 'TenantId'),
        kind: 'report',
        issuedAt: events.report.createdAt,
        payload: events.report,
      },
      ...events.events,
    ];
  }

  getStats(): { sent: number; failed: number; lastSeen: string } {
    return this.stats.read();
  }
}

export const asRunEnvelope = (session: RunSession): RecoveryOperationsEnvelope<RunSession> => ({
  eventId: `${session.runId}-${session.ticketId}`,
  tenant: withBrand(String(session.id), 'TenantId'),
  payload: session,
  createdAt: new Date().toISOString(),
});
