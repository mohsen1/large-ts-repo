import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { ArchiveOutput } from './types';

export interface DrillNotification {
  readonly summaryKey: string;
  readonly tenant: string;
  readonly runId: string;
  readonly event: string;
  readonly route: 'critical' | 'standard';
}

export class DrillSnsNotifier {
  private readonly client: SNSClient;
  private readonly topicArn: string;

  constructor(topicArn: string) {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    const endpoint = process.env.AWS_SNS_ENDPOINT;
    this.client = new SNSClient({ region, ...(endpoint ? { endpoint } : {}) });
    this.topicArn = topicArn;
  }

  async publish(summary: ArchiveOutput): Promise<Result<{ messageId: string }, Error>> {
    const event: DrillNotification = {
      summaryKey: JSON.stringify({ tenant: summary.summary.tenant, runId: summary.summary.runId }),
      tenant: summary.summary.tenant,
      runId: summary.summary.runId,
      event: 'recovery-drill-summary',
      route: summary.summary.criticalHits > 0 ? 'critical' : 'standard',
    };

    try {
      const response = await this.client.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Message: JSON.stringify(event),
          Subject: `Recovery Drill Summary ${summary.summary.runId}`,
          MessageAttributes: {
            tenant: { DataType: 'String', StringValue: summary.summary.tenant },
            route: { DataType: 'String', StringValue: event.route },
          },
        }),
      );

      return ok({ messageId: response.MessageId ?? 'n/a' });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('sns-notify-failed'));
    }
  }
}

export class NullDrillNotifier {
  async publish(output: ArchiveOutput): Promise<Result<{ messageId: string }, Error>> {
    return ok({ messageId: `noop:${output.summary.runId}` });
  }
}
