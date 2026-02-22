import { SNSClient, PublishCommand, PublishCommandInput } from '@aws-sdk/client-sns';
import { Envelope } from '@shared/protocol';

export interface IncidentPublisher {
  publish<T>(envelope: Envelope<T>): Promise<string>;
}

export class SnsIncidentPublisher implements IncidentPublisher {
  constructor(private readonly sns: SNSClient, private readonly topicArn: string) {}

  async publish<T>(envelope: Envelope<T>): Promise<string> {
    const input: PublishCommandInput = {
      TopicArn: this.topicArn,
      Message: JSON.stringify(envelope),
      Subject: String(envelope.eventType),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: envelope.eventType,
        },
      },
    };

    const result = await this.sns.send(new PublishCommand(input));
    return result.MessageId ?? '';
  }
}

export class NullIncidentPublisher implements IncidentPublisher {
  async publish<T>(_envelope: Envelope<T>): Promise<string> {
    return 'mock-message-id';
  }
}
