import { SQSClient, SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';

export interface SqsOptions {
  queueUrl: string;
}

export class SqsAdapter {
  constructor(private readonly client: SQSClient, private readonly options: SqsOptions) {}

  async publish(body: string): Promise<string | undefined> {
    const response = await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.options.queueUrl,
        MessageBody: body,
      })
    );
    return response.MessageId;
  }

  async poll(): Promise<string[]> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.options.queueUrl,
        MaxNumberOfMessages: 10,
      })
    );

    return (response.Messages ?? [])
      .map((message) => message.Body)
      .filter((value): value is string => value !== undefined);
  }
}
