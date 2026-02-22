import type { PublishCommandInput } from '@aws-sdk/client-sns';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { ok, fail, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { PolicyEvaluationOutcome } from '@domain/recovery-operations-governance';

interface CompliancePublisherConfig {
  readonly topicArn: string;
  readonly region?: string;
}

export interface CompliancePublisher {
  publishPolicyOutcome(tenant: string, outcome: PolicyEvaluationOutcome): Promise<Result<void, string>>;
}

export class SnsCompliancePublisher implements CompliancePublisher {
  private readonly client: SNSClient;

  constructor(private readonly config: CompliancePublisherConfig) {
    this.client = new SNSClient({ region: config.region ?? 'us-east-1' });
  }

  async publishPolicyOutcome(tenant: string, outcome: PolicyEvaluationOutcome): Promise<Result<void, string>> {
    const subject = `[Recovery Compliance] ${tenant} run ${outcome.runId}`;
    const payload: PublishCommandInput = {
      TopicArn: this.config.topicArn,
      Subject: subject,
      Message: JSON.stringify(outcome),
      MessageAttributes: {
        tenant: { DataType: 'String', StringValue: tenant },
        outcome: { DataType: 'String', StringValue: outcome.blocked ? 'blocked' : 'allowed' },
      },
    };

    try {
      await this.client.send(new PublishCommand(payload));
      return ok(undefined);
    } catch (error) {
      return fail(`SNS_PUBLISH_FAILED:${(error as Error).message ?? 'unknown'}`);
    }
  }
}

export class NoopCompliancePublisher implements CompliancePublisher {
  async publishPolicyOutcome(): Promise<Result<void, string>> {
    return ok(undefined);
  }
}
