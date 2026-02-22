import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { ok, fail, type Result } from '@shared/result';
import type { BatchReadinessAssessment, CohortSignalAggregate } from '@domain/recovery-operations-intelligence';
import type { IntelligenceSnapshot } from '@data/recovery-operations-intelligence-store';
import { parseDecisionSet, parseCohortSignalAggregate } from '@domain/recovery-operations-intelligence';

interface PublishConfig {
  readonly queueUrl: string;
  readonly region?: string;
}

export interface ReadinessEnvelope {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly cohorts: readonly CohortSignalAggregate[];
}

export class IntelligencePublisher {
  private readonly client: SQSClient;

  constructor(private readonly config: PublishConfig) {
    this.client = new SQSClient({ region: config.region ?? 'us-east-1' });
  }

  async publishSnapshot(snapshot: IntelligenceSnapshot): Promise<Result<void, string>> {
    const payload = JSON.stringify({
      tenant: snapshot.tenant,
      runId: snapshot.runId,
      recordedAt: snapshot.recordedAt,
      pointCount: snapshot.points.length,
    });

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.config.queueUrl,
          MessageBody: payload,
          MessageAttributes: {
            type: { DataType: 'String', StringValue: 'snapshot' },
            snapshotId: { DataType: 'String', StringValue: String(snapshot.id) },
          },
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(`SNAPSHOT_PUBLISH_FAILED:${(error as Error).message ?? 'unknown'}`);
    }
  }

  async publishBatch(batch: BatchReadinessAssessment): Promise<Result<void, string>> {
    const payload = JSON.stringify(parseDecisionSet({
      id: `${batch.generatedAt}-decision`,
      tenant: batch.cohort[0]?.tenant ?? 'unknown',
      generatedAt: new Date().toISOString(),
      assessments: [],
      batchRisk: batch.overallRisk,
    }));

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.config.queueUrl,
          MessageBody: payload,
          MessageAttributes: {
            type: { DataType: 'String', StringValue: 'batch' },
            tenant: { DataType: 'String', StringValue: batch.cohort[0]?.tenant ?? 'unknown' },
          },
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(`BATCH_PUBLISH_FAILED:${(error as Error).message ?? 'unknown'}`);
    }
  }
}

export class CohortValidator {
  validate(cohorts: readonly CohortSignalAggregate[]): CohortSignalAggregate[] {
    return cohorts
      .map((cohort) => parseCohortSignalAggregate(cohort))
      .filter((cohort) => cohort.count >= 0)
      .sort((left, right) => right.count - left.count);
  }

  asEnvelope(cohorts: readonly CohortSignalAggregate[], tenant: string): ReadinessEnvelope {
    return {
      tenant,
      generatedAt: new Date().toISOString(),
      cohorts: this.validate(cohorts),
    };
  }
}
