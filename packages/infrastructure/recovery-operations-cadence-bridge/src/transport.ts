import { SNSClient, PublishCommand, type MessageAttributeValue } from '@aws-sdk/client-sns';
import type { CadenceRunPlan } from '@domain/recovery-operations-cadence';

interface CadenceTransportConfig {
  readonly region?: string;
  readonly topicArn: string;
  readonly source: string;
}

export interface CadenceTransport {
  publishPlan(plan: CadenceRunPlan): Promise<void>;
  publishStatus(planId: string, status: string, detail: unknown): Promise<void>;
  publishEvents(events: readonly string[]): Promise<void>;
}

export interface CadenceTransportEvent {
  readonly type: string;
  readonly planId: string;
  readonly emittedAt: string;
  readonly payload: unknown;
  readonly source: string;
}

const asMessageAttributes = (entries: Record<string, MessageAttributeValue>): Record<string, MessageAttributeValue> =>
  entries;

const buildAttributes = (plan: CadenceRunPlan, status: string): Record<string, MessageAttributeValue> =>
  asMessageAttributes({
    source: {
      DataType: 'String',
      StringValue: 'recovery-operations-cadence-bridge',
    },
    tenant: {
      DataType: 'String',
      StringValue: String(plan.profile.tenant),
    },
    planId: {
      DataType: 'String',
      StringValue: String(plan.id),
    },
    status: {
      DataType: 'String',
      StringValue: status,
    },
    priority: {
      DataType: 'String',
      StringValue: plan.profile.priority,
    },
    slotCount: {
      DataType: 'Number',
      StringValue: String(plan.slots.length),
    },
  });

export class RecoveryOperationsCadenceSnsTransport implements CadenceTransport {
  private readonly client: SNSClient;
  private readonly config: CadenceTransportConfig;

  constructor(config: CadenceTransportConfig) {
    this.config = config;
    this.client = new SNSClient({ region: config.region ?? 'us-east-1' });
  }

  async publishPlan(plan: CadenceRunPlan): Promise<void> {
    await this.client.send(
      new PublishCommand({
        TopicArn: this.config.topicArn,
        Message: JSON.stringify(plan),
        MessageAttributes: buildAttributes(plan, 'plan'),
        MessageGroupId: String(plan.runId),
        MessageDeduplicationId: `${this.config.source}-${plan.id}`,
      }),
    );
  }

  async publishStatus(planId: string, status: string, detail: unknown): Promise<void> {
    await this.client.send(
      new PublishCommand({
        TopicArn: this.config.topicArn,
        Message: JSON.stringify({ planId, status, detail, source: this.config.source }),
        MessageAttributes: asMessageAttributes({
          source: {
            DataType: 'String',
            StringValue: 'recovery-operations-cadence-bridge',
          },
          status: {
            DataType: 'String',
            StringValue: status,
          },
          planId: {
            DataType: 'String',
            StringValue: String(planId),
          },
        }),
      }),
    );
  }

  async publishEvents(events: readonly string[]): Promise<void> {
    const batch = {
      type: 'cadence_events',
      emittedAt: new Date().toISOString(),
      source: this.config.source,
      count: events.length,
      events: [...events],
    };

    await this.client.send(
      new PublishCommand({
        TopicArn: this.config.topicArn,
        Message: JSON.stringify(batch),
        MessageAttributes: asMessageAttributes({
          source: {
            DataType: 'String',
            StringValue: 'recovery-operations-cadence-bridge',
          },
          eventType: {
            DataType: 'String',
            StringValue: 'cadence_events',
          },
          count: {
            DataType: 'Number',
            StringValue: String(batch.count),
          },
        }),
      }),
    );
  }
}

export class InMemoryCadenceTransport implements CadenceTransport {
  readonly timeline: CadenceTransportEvent[] = [];

  async publishPlan(plan: CadenceRunPlan): Promise<void> {
    this.timeline.push({
      type: 'plan',
      planId: String(plan.id),
      emittedAt: new Date().toISOString(),
      payload: plan,
      source: String(plan.profile.source),
    });
  }

  async publishStatus(planId: string, status: string, detail: unknown): Promise<void> {
    this.timeline.push({
      type: 'status',
      planId,
      emittedAt: new Date().toISOString(),
      payload: { status, detail },
      source: 'in-memory',
    });
  }

  async publishEvents(events: readonly string[]): Promise<void> {
    events.forEach((event) => {
      this.timeline.push({
        type: 'event',
        planId: `events:${event}`,
        emittedAt: new Date().toISOString(),
        payload: { value: event },
        source: 'in-memory',
      });
    });
  }
}

export const createCadenceTransport = (config: CadenceTransportConfig): CadenceTransport => {
  if (config.topicArn === 'in-memory') {
    return new InMemoryCadenceTransport();
  }
  return new RecoveryOperationsCadenceSnsTransport(config);
};
