import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Envelope } from '@shared/protocol';

export interface EventBridgeOptions {
  eventBusName: string;
}

export class EventBridgeAdapter {
  constructor(private readonly client: EventBridgeClient, private readonly options: EventBridgeOptions) {}

  async publish<T>(envelope: Envelope<T>): Promise<void> {
    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.options.eventBusName,
            Source: envelope.eventType,
            DetailType: envelope.eventType,
            Detail: JSON.stringify(envelope),
          },
        ],
      })
    );
  }
}
