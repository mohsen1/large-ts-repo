import { GetObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { ContinuityPlanRecord, PlanRunRecord } from '@data/recovery-continuity-plan-store';
import { ok, fail, type Result } from '@shared/result';
import { encodePlanRecord, encodeRunRecord, parsePlanRecord, parseRunRecord } from '@data/recovery-continuity-plan-store';

interface ArchiveConfig {
  readonly region?: string;
  readonly bucketName: string;
}

export interface ContinuityArchive {
  putPlan(plan: ContinuityPlanRecord): Promise<Result<void, Error>>;
  loadPlan(planId: string): Promise<Result<ContinuityPlanRecord | undefined, Error>>;
  putRun(run: PlanRunRecord): Promise<Result<void, Error>>;
  loadRun(runId: string): Promise<Result<PlanRunRecord | undefined, Error>>;
}

export class ContinuityS3Archive implements ContinuityArchive {
  private readonly client: S3Client;

  constructor(
    private readonly config: ArchiveConfig,
    client = new S3Client({ region: config.region ?? 'us-east-1' }),
  ) {
    this.client = client;
  }

  async putPlan(plan: ContinuityPlanRecord): Promise<Result<void, Error>> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key: `continuity-plans/${plan.tenantId}/${plan.id}.json`,
          Body: encodePlanRecord(plan),
          ContentType: 'application/json',
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async loadPlan(planId: string): Promise<Result<ContinuityPlanRecord | undefined, Error>> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucketName,
          Key: `continuity-plans/${planId}.json`,
        }),
      );

      if (!response.Body) return ok(undefined);
      const raw = await response.Body.transformToString();
      const record = parsePlanRecord(raw);
      return ok(record);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async putRun(run: PlanRunRecord): Promise<Result<void, Error>> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key: `continuity-runs/${run.tenantId}/${run.runId}.json`,
          Body: encodeRunRecord(run),
          ContentType: 'application/json',
        }),
      );
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async loadRun(runId: string): Promise<Result<PlanRunRecord | undefined, Error>> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucketName,
          Key: `continuity-runs/${runId}.json`,
        }),
      );

      if (!response.Body) return ok(undefined);
      const raw = await response.Body.transformToString();
      const record = parseRunRecord(raw);
      return ok(record);
    } catch (error) {
      return fail(error as Error);
    }
  }
}

export const buildArchiveKey = (tenantId: string, id: string, kind: 'plan' | 'run'): string =>
  kind === 'plan' ? `continuity-plans/${tenantId}/${id}.json` : `continuity-runs/${tenantId}/${id}.json`;
