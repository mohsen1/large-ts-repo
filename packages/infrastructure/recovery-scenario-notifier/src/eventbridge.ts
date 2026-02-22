import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoveryNotificationPayload } from './adapter';

export interface EventBridgeSettings {
  readonly eventBusName: string;
  readonly detailType: string;
  readonly source: string;
}

export const publishScenarioEvent = async (
  client: EventBridgeClient,
  payload: RecoveryNotificationPayload,
  settings: EventBridgeSettings,
): Promise<Result<string, Error>> => {
  try {
    const response = await client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: settings.eventBusName,
            Source: settings.source,
            DetailType: settings.detailType,
            Detail: JSON.stringify(payload),
            Time: new Date(payload.occurredAtUtc),
          },
        ],
      }),
    );
    const eventId = response.Entries?.at(0)?.EventId ?? 'eventbridge-no-id';
    return ok(eventId);
  } catch (error) {
    return fail(error as Error);
  }
};
