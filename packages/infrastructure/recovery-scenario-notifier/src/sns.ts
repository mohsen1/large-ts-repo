import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoveryNotificationPayload } from './adapter';

export interface SnsSettings {
  readonly topicArn: string;
}

export const publishScenarioNotification = async (
  client: SNSClient,
  payload: RecoveryNotificationPayload,
  settings: SnsSettings,
): Promise<Result<string, Error>> => {
  try {
    const result = await client.send(
      new PublishCommand({
        TopicArn: settings.topicArn,
        Message: JSON.stringify(payload),
        Subject: `recovery-scenario:${payload.scenarioId}`,
        MessageAttributes: {
          tenantId: {
            DataType: 'String',
            StringValue: payload.tenantId,
          },
          severity: {
            DataType: 'String',
            StringValue: payload.impact,
          },
        },
      }),
    );

    return ok(result.MessageId ?? 'sns-no-id');
  } catch (error) {
    return fail(error as Error);
  }
};
