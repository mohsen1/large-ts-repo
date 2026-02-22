import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Result, ok, err } from '@shared/result';
import { AdaptiveRun } from '@domain/adaptive-ops';

interface SqsOptions {
  queueUrl: string;
  region?: string;
}

export class SqsRunAdapter {
  private readonly client: SQSClient;

  constructor(
    private readonly options: SqsOptions,
    region: string = 'us-east-1',
  ) {
    this.client = new SQSClient({ region });
  }

  static create(options: SqsOptions): SqsRunAdapter {
    return new SqsRunAdapter(options);
  }

  async publishRun(run: AdaptiveRun): Promise<Result<void, string>> {
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.options.queueUrl,
          MessageBody: JSON.stringify({ run, sentAt: new Date().toISOString() }),
          MessageAttributes: {
            runId: {
              DataType: 'String',
              StringValue: run.incidentId,
            },
          },
        }),
      );
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : 'sqs publish failed');
    }
  }
}
