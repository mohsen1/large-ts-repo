import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { ContinuityEventEnvelope } from '@domain/continuity-orchestration';
import { ContinuitySignalBus } from '@domain/continuity-orchestration';

export interface EventBridgePublisherOptions {
  eventBusName: string;
  client?: EventBridgeClient;
}

export class EventBridgePublisher implements ContinuitySignalBus {
  private readonly client: EventBridgeClient;
  private readonly options: EventBridgePublisherOptions;

  constructor(options: EventBridgePublisherOptions) {
    this.client = options.client ?? new EventBridgeClient({});
    this.options = options;
  }

  async publish<C = Record<string, unknown>>(envelope: ContinuityEventEnvelope<C>): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          EventBusName: this.options.eventBusName,
          Source: 'continuity-runtime',
          DetailType: envelope.eventType,
          Detail: JSON.stringify(envelope),
        },
      ],
    });
    await this.client.send(command);
  }
}
