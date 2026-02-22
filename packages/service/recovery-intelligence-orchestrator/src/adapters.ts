import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { RecoveryForecast, RecoveryRecommendation } from '@domain/recovery-intelligence';

export interface IntelligenceArtifacts {
  readonly recommendation: RecoveryRecommendation;
  readonly forecast: RecoveryForecast;
}

export const archiveForecast = async (
  client: S3Client,
  bucket: string,
  artifact: IntelligenceArtifacts,
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: `recovery-intelligence/${artifact.recommendation.recommendationId}.json`,
    Body: JSON.stringify(artifact),
    ContentType: 'application/json',
  });
  const response = await client.send(command);
  return response.ETag ?? 'missing-etag';
}

export interface NotifyOptions {
  channelArn: string;
  tenantId: string;
  bundleId: string;
}

export const publishNotification = async (
  client: SNSClient,
  options: NotifyOptions,
): Promise<string> => {
  const command = new PublishCommand({
    TopicArn: options.channelArn,
    Message: JSON.stringify({
      tenantId: options.tenantId,
      bundleId: options.bundleId,
      triggeredAt: new Date().toISOString(),
    }),
    MessageAttributes: {
      tenantId: {
        DataType: 'String',
        StringValue: options.tenantId,
      },
    },
  });
  const response = await client.send(command);
  return response.MessageId ?? 'missing-message-id';
};
