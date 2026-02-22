import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { ArchiveWriteOptions, ArchivedResult } from './types';
import type { RecoveryDrillRunSummary } from '@domain/recovery-drill-telemetry';

export class DrillS3Archive {
  private readonly client: S3Client;
  private readonly options: ArchiveWriteOptions & { region: string };

  constructor(options: ArchiveWriteOptions) {
    const region = options.region ?? process.env.AWS_REGION ?? 'us-east-1';
    const endpoint = options.endpoint ?? process.env.AWS_S3_ENDPOINT;
    this.client = new S3Client({ region, ...(endpoint ? { endpoint, forcePathStyle: true } : {}) });
    this.options = { runPrefix: 'run', ...options, region };
  }

  async putSummary(runId: string, summary: RecoveryDrillRunSummary): Promise<Result<ArchivedResult, Error>> {
    const key = this.makeKey(summary.tenant, runId);
    const payload = JSON.stringify(summary);

    try {
      const command = new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: payload,
        ContentType: 'application/json',
      });
      const response = await this.client.send(command);
      return ok({
        manifest: {
          tenant: summary.tenant,
          runId,
          bucket: this.options.bucket,
          objectKey: key,
          createdAt: new Date().toISOString(),
        },
        etag: response.ETag ?? 'unknown',
        bytes: payload.length,
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('s3-archive-failed'));
    }
  }

  private makeKey(tenant: RecoveryDrillRunSummary['tenant'], runId: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${tenant}/${this.options.runPrefix}/${date}/${runId}.json`;
  }
}
