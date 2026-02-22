import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { fail, ok, type Result } from '@shared/result';
import type { ForecastPublishedMessage, IncidentReadinessMessage, IncidentNotifier } from './types';

const enqueue = (queueUrl: string, body: Record<string, unknown>) => ({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify(body),
});

export class SqsIncidentNotifier implements IncidentNotifier {
  constructor(
    private readonly sqs: SQSClient,
    private readonly readinessQueueUrl: string,
    private readonly forecastQueueUrl: string,
  ) {}

  async publishReadiness(payload: IncidentReadinessMessage): Promise<Result<void, Error>> {
    if (!this.readinessQueueUrl) return fail(new Error('readiness-queue-empty'));
    try {
      await this.sqs.send(
        new SendMessageCommand({
          ...enqueue(this.readinessQueueUrl, {
            kind: 'readiness',
            emittedAt: new Date().toISOString(),
            payload,
          }),
          MessageGroupId: payload.tenantId,
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async publishForecast(payload: ForecastPublishedMessage): Promise<Result<void, Error>> {
    if (!this.forecastQueueUrl) return fail(new Error('forecast-queue-empty'));
    try {
      await this.sqs.send(
        new SendMessageCommand({
          ...enqueue(this.forecastQueueUrl, {
            kind: 'forecast',
            emittedAt: new Date().toISOString(),
            payload,
          }),
          MessageGroupId: payload.tenantId,
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }
}
