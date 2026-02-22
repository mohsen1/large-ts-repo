import { createPublisher, type IncidentPublisher } from '@infrastructure/incident-notifications';
import type { IncidentEvent } from '@domain/recovery-incident-orchestration';
import { createEnvelope, type Envelope } from '@shared/protocol';

export interface NotificationConfig {
  readonly topicArn?: string;
}

export interface NotificationPublishResult {
  readonly messageId: string;
  readonly eventType: string;
}

const asEnvelope = (event: IncidentEvent): Envelope<IncidentEvent> => {
  return createEnvelope(`incident.orchestration.${event.type}`, event);
};

export const publishIncidentEvent = async (event: IncidentEvent, _config?: NotificationConfig): Promise<NotificationPublishResult> => {
  const publisher: IncidentPublisher = createPublisher();
  const envelope = asEnvelope(event);
  const messageId = await publisher.publish(envelope);
  return {
    messageId,
    eventType: event.type,
  };
};

export const publishEvents = async (events: readonly IncidentEvent[]): Promise<readonly NotificationPublishResult[]> => {
  const publishes: Promise<NotificationPublishResult>[] = events.map((event) => publishIncidentEvent(event));
  return Promise.all(publishes);
};

export const formatDeliveryReport = (results: readonly NotificationPublishResult[]): string => {
  return results.map((result) => `${result.eventType}:${result.messageId}`).join('|');
};
