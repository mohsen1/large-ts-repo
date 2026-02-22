import { SNSClient } from '@aws-sdk/client-sns';
import { IncidentPublisher, SnsIncidentPublisher, NullIncidentPublisher } from './publisher';

export interface IncidentPublisherFactory {
  create(): IncidentPublisher;
}

export class EnvIncidentPublisherFactory implements IncidentPublisherFactory {
  constructor(private readonly topicArn: string) {}

  create(): IncidentPublisher {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    const endpoint = process.env.AWS_SNS_ENDPOINT;
    const sns = new SNSClient({ region, ...(endpoint ? { endpoint } : {}) });
    return new SnsIncidentPublisher(sns, this.topicArn);
  }
}

export const createPublisher = (): IncidentPublisher => {
  const topicArn = process.env.INCIDENT_SNS_TOPIC_ARN;
  if (!topicArn) {
    return new NullIncidentPublisher();
  }
  return new EnvIncidentPublisherFactory(topicArn).create();
};
