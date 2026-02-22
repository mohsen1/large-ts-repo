import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { RecoveryOperationsEnvelope, RecoverySignal } from '@domain/recovery-operations-models';

interface QueueConfig {
  readonly queueUrl: string;
  readonly region?: string;
}

export interface QueuePublisher {
  publishSignal(envelope: RecoveryOperationsEnvelope<RecoverySignal>): Promise<void>;
  publishPayload<T>(envelope: RecoveryOperationsEnvelope<T>): Promise<void>;
}

export class RecoveryOperationsQueuePublisher implements QueuePublisher {
  private readonly client: SQSClient;

  constructor(private readonly config: QueueConfig) {
    this.client = new SQSClient({ region: config.region ?? 'us-east-1' });
  }

  async publishSignal(envelope: RecoveryOperationsEnvelope<RecoverySignal>): Promise<void> {
    await this.publishPayload(envelope);
  }

  async publishPayload<T>(envelope: RecoveryOperationsEnvelope<T>): Promise<void> {
    const payload = JSON.stringify(envelope);
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: payload,
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: 'recovery.operations',
          },
        },
      }),
    );
  }
}
