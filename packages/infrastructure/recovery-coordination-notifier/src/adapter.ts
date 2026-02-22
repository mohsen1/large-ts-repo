import { PutEventsCommand, EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { CoordinationDeliveryEvent, CoordinationDeliveryPolicy } from './types';
import type { CoordinationDeliveryChannel, CoordinationDeliveryResult } from './index';

interface EventBridgeDependencies {
  readonly client?: EventBridgeClient;
}

export class EventBridgeCoordinationDelivery implements CoordinationDeliveryChannel {
  private readonly client: EventBridgeClient;
  private readonly policy: CoordinationDeliveryPolicy;

  constructor(
    private readonly source: string,
    private readonly detailType: string,
    private readonly eventBusName: string,
    policy?: Partial<CoordinationDeliveryPolicy>,
    deps: EventBridgeDependencies = {},
  ) {
    this.client = deps.client ?? new EventBridgeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.EVENTBRIDGE_ENDPOINT,
    });
    this.policy = {
      tenant: '' as CoordinationDeliveryPolicy['tenant'],
      maxAttempts: 3,
      retryDelayMs: 10,
      backoffFactor: 1.5,
      ...(policy ?? {}),
    };
  }

  async publish(event: CoordinationDeliveryEvent): Promise<Result<CoordinationDeliveryResult, Error>> {
    const payload = this.envelope(event);
    let attempt = 0;
    while (attempt < this.policy.maxAttempts) {
      attempt += 1;
      try {
        const command = new PutEventsCommand({
          Entries: [
            {
              Source: this.source,
              DetailType: this.detailType,
              EventBusName: this.eventBusName,
              Detail: JSON.stringify(payload),
            },
          ],
        });
        const response = await this.client.send(command);
        const messageId = (response.Entries?.[0]?.EventId) ?? `${Date.now()}`;
        return ok({
          delivered: true,
          messageId,
          deliveredAt: new Date().toISOString(),
        });
      } catch (error) {
        if (attempt >= this.policy.maxAttempts) {
          return fail(error instanceof Error ? error : new Error('coordination-delivery-failed'));
        }
        await sleep(this.policy.retryDelayMs * Math.pow(this.backoffMultiplier(), attempt));
      }
    }
    return fail(new Error('coordination-delivery-exhausted'));
  }

  private envelope(event: CoordinationDeliveryEvent) {
    return {
      tenant: event.tenant,
      runId: event.runId,
      title: event.title,
      body: event.body,
      candidate: event.candidate,
      generatedAt: event.generatedAt,
      emittedAt: new Date().toISOString(),
    };
  }

  private backoffMultiplier(): number {
    return this.policy.backoffFactor;
  }
}

export class InMemoryCoordinationDelivery implements CoordinationDeliveryChannel {
  private readonly events: CoordinationDeliveryEvent[] = [];

  async publish(event: CoordinationDeliveryEvent): Promise<Result<CoordinationDeliveryResult, Error>> {
    this.events.push(event);
    return ok({
      delivered: true,
      messageId: `in-memory-${this.events.length}`,
      deliveredAt: new Date().toISOString(),
    });
  }

  async replay(): Promise<readonly CoordinationDeliveryEvent[]> {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
