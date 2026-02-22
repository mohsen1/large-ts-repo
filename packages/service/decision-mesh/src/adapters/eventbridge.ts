import { EventBridgeClient, PutEventsCommand, type PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import { type Envelope } from '@shared/protocol';
import { InMemoryMeshTelemetry } from '../telemetry';

export interface EventBridgeDecisionResult {
  id: string;
}

export class EventBridgePublisher {
  private readonly client = new EventBridgeClient({});

  constructor(
    private readonly sourceBus: string,
    private readonly eventBusName: string,
    private readonly detailType: string,
    private readonly telemetry?: InMemoryMeshTelemetry,
  ) {}

  async publish<T>(envelope: Envelope<T>, eventType: string): Promise<EventBridgeDecisionResult | undefined> {
    const entry: PutEventsRequestEntry = {
      EventBusName: this.eventBusName,
      Source: this.sourceBus,
      DetailType: `${this.detailType}.${eventType}`,
      Detail: JSON.stringify(envelope),
    };

    const result = await this.client.send(new PutEventsCommand({ Entries: [entry] }));
    const eventId = result.Entries?.[0]?.EventId;
    if (!eventId) {
      this.telemetry?.markFailed(
        {
          requestId: envelope.id,
          tenantId: envelope.correlationId,
          eventType: 'failed',
        },
        'eventbridge-rejected',
      );
      return undefined;
    }

    this.telemetry?.markCompleted(
      {
        requestId: envelope.id,
        tenantId: envelope.correlationId,
        eventType: 'completed',
      },
      0,
    );
    return { id: eventId };
  }
}

export const createBusPublisher = (sourceBus: string, eventBusName: string, detailType: string) =>
  new EventBridgePublisher(sourceBus, eventBusName, detailType);
