import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { fail, ok, type Result } from '@shared/result';
import type { RiskConnector, RiskConnectorOutcome, PublishedSignalPack } from './types';
import { makePayload } from './transformers';

export class RiskSnsConnector implements RiskConnector {
  constructor(
    private readonly sns: SNSClient,
    private readonly topicArn: string,
  ) {}

  async publish(pack: PublishedSignalPack): Promise<Result<RiskConnectorOutcome, Error>> {
    if (!this.topicArn) {
      return fail(new Error('topic-arn-empty'));
    }

    const envelope = makePayload(
      `${pack.envelope.connectorId}:sns`,
      'strategy-result',
      'high',
      pack.strategyRun,
      pack.vectorPack,
    );

    try {
      await this.sns.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Message: JSON.stringify(envelope),
          Subject: pack.envelope.connectorId,
        }),
      );
      return ok('accepted');
    } catch (error) {
      return fail(error as Error);
    }
  }
}

export class RiskSqsConnector implements RiskConnector {
  constructor(
    private readonly sqs: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async publish(pack: PublishedSignalPack): Promise<Result<RiskConnectorOutcome, Error>> {
    if (!this.queueUrl) {
      return fail(new Error('queue-url-empty'));
    }

    const envelope = makePayload(
      `${pack.envelope.connectorId}:sqs`,
      'signal-pack',
      'medium',
      pack.strategyRun,
      pack.vectorPack,
    );

    try {
      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(envelope),
          MessageGroupId: pack.envelope.correlationId,
        }),
      );
      return ok('accepted');
    } catch (error) {
      return fail(error as Error);
    }
  }
}

export const publishSafely = async (
  connector: RiskConnector,
  pack: PublishedSignalPack,
): Promise<Result<RiskConnectorOutcome, Error>> => {
  const result = await connector.publish(pack);
  if (!result.ok) {
    return fail(result.error);
  }
  return ok(result.value);
};
