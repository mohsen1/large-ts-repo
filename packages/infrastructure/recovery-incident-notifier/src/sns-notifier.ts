import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { fail, ok, type Result } from '@shared/result';
import type { ForecastPublishedMessage, IncidentReadinessMessage, IncidentNotifier } from './types';

const snsPayload = (message: Record<string, unknown>) => ({
  Message: JSON.stringify(message),
  MessageAttributes: {
    origin: {
      DataType: 'String',
      StringValue: 'recovery-incident-notifier',
    },
  },
});

export class SnsIncidentNotifier implements IncidentNotifier {
  constructor(
    private readonly sns: SNSClient,
    private readonly readinessTopicArn: string,
    private readonly forecastTopicArn: string,
  ) {}

  async publishReadiness(payload: IncidentReadinessMessage): Promise<Result<void, Error>> {
    if (!this.readinessTopicArn) return fail(new Error('readiness-topic-empty'));
    try {
      const message = snsPayload({
        kind: 'readiness',
        ...payload,
        publishedAt: new Date().toISOString(),
      });
      await this.sns.send(
        new PublishCommand({
          TopicArn: this.readinessTopicArn,
          Message: message.Message,
          MessageAttributes: message.MessageAttributes,
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async publishForecast(payload: ForecastPublishedMessage): Promise<Result<void, Error>> {
    if (!this.forecastTopicArn) return fail(new Error('forecast-topic-empty'));
    try {
      const message = snsPayload({
        kind: 'forecast',
        ...payload,
        publishedAt: new Date().toISOString(),
      });
      await this.sns.send(
        new PublishCommand({
          TopicArn: this.forecastTopicArn,
          Message: message.Message,
          MessageAttributes: message.MessageAttributes,
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }
}
