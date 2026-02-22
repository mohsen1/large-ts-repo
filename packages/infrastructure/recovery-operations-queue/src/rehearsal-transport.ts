import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { RecoveryOperationsEnvelope } from '@domain/recovery-operations-models';
import {
  type RehearsalEnvelope,
  type RehearsalId,
  type RehearsalRunId,
  type RehearsalSignal,
  type RehearsalPlan,
} from '@domain/recovery-operations-models';

interface RehearsalTransportConfig {
  readonly queueUrl: string;
  readonly region?: string;
  readonly source: string;
}

export interface RehearsalTransport {
  publishPlan(plan: RehearsalPlan): Promise<void>;
  publishEnvelope<T>(envelope: RecoveryOperationsEnvelope<T> | RehearsalEnvelope<T>): Promise<void>;
  publishSignal(signal: RehearsalSignal): Promise<void>;
}

export interface RehearsalTransportEvent {
  readonly planId: RehearsalId;
  readonly runId: RehearsalRunId;
  readonly kind: 'plan' | 'envelope' | 'signal';
  readonly source: string;
  readonly payload: unknown;
}

export class SqsRehearsalTransport implements RehearsalTransport {
  private readonly client: SQSClient;

  constructor(private readonly config: RehearsalTransportConfig) {
    this.client = new SQSClient({ region: config.region ?? 'us-east-1' });
  }

  async publishPlan(plan: RehearsalPlan): Promise<void> {
    await this.sendEnvelope({
      planId: plan.id,
      runId: plan.runId,
      kind: 'plan',
      source: this.config.source,
      payload: plan,
    });
  }

  async publishEnvelope<T>(envelope: RecoveryOperationsEnvelope<T> | RehearsalEnvelope<T>): Promise<void> {
    const tenant = String(envelope.tenant);
    await this.sendEnvelope({
      planId: 'default-plan' as RehearsalId,
      runId: `${Date.now()}` as RehearsalRunId,
      kind: 'envelope',
      source: `${this.config.source}:${tenant}`,
      payload: envelope,
    });
  }

  async publishSignal(signal: RehearsalSignal): Promise<void> {
    await this.sendEnvelope({
      planId: `${signal.runId}-signal` as RehearsalId,
      runId: signal.runId,
      kind: 'signal',
      source: this.config.source,
      payload: {
        category: signal.category,
        severity: signal.severity,
        confidence: signal.confidence,
        observedAt: signal.observedAt,
      },
    });
  }

  private async sendEnvelope(event: RehearsalTransportEvent): Promise<void> {
    const payload = JSON.stringify(event);
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: payload,
        MessageAttributes: {
          source: {
            DataType: 'String',
            StringValue: this.config.source,
          },
          kind: {
            DataType: 'String',
            StringValue: event.kind,
          },
          runId: {
            DataType: 'String',
            StringValue: String(event.runId),
          },
        },
      }),
    );
  }
}

export class InMemoryRehearsalTransport implements RehearsalTransport {
  readonly events: RehearsalTransportEvent[] = [];

  async publishPlan(plan: RehearsalPlan): Promise<void> {
    this.events.push({
      planId: plan.id,
      runId: plan.runId,
      kind: 'plan',
      source: 'in-memory',
      payload: plan,
    });
  }

  async publishEnvelope<T>(envelope: RecoveryOperationsEnvelope<T> | RehearsalEnvelope<T>): Promise<void> {
    const tenant = String(envelope.tenant);
    this.events.push({
      planId: 'default-plan' as RehearsalId,
      runId: `${Date.now()}` as RehearsalRunId,
      kind: 'envelope',
      source: `in-memory:${tenant}`,
      payload: envelope,
    });
  }

  async publishSignal(signal: RehearsalSignal): Promise<void> {
    this.events.push({
      planId: `${signal.runId}-signal` as RehearsalId,
      runId: signal.runId,
      kind: 'signal',
      source: 'in-memory',
      payload: {
        signal,
      },
    });
  }
}

export const createRehearsalTransport = (config: RehearsalTransportConfig): RehearsalTransport => {
  return new SqsRehearsalTransport(config);
};
