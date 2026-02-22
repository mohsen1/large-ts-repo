import { fail, ok, Result } from '@shared/result';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ArchiveBucketName, ArchiveObjectKey, PlanArchiveEntry } from './models';
import { ControlRunRecord } from './models';
import { ArchiveService } from './repository';

interface S3AdapterConfig {
  bucket: ArchiveBucketName;
  region?: string;
}

const readBody = async (body: unknown): Promise<string> => {
  if (typeof body === 'string') return body;
  if (body == null) return '';
  if (typeof (body as { text?: () => Promise<string> }).text === 'function') {
    return await (body as { text: () => Promise<string> }).text();
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  return '';
};

export class S3OperationsArchiveAdapter implements ArchiveService {
  private readonly client: S3Client;

  constructor(private readonly config: S3AdapterConfig) {
    this.client = new S3Client({ region: config.region ?? 'us-east-1' });
  }

  async archive(run: ControlRunRecord): Promise<Result<PlanArchiveEntry, Error>> {
    const key = `${run.tenantId}/${run.requestId}/${run.runId}.json` as ArchiveObjectKey;
    const entry: PlanArchiveEntry = {
      runId: run.runId,
      payload: run,
      bucket: this.config.bucket,
      key,
    };

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: new TextEncoder().encode(JSON.stringify(entry)),
      ContentType: 'application/json',
      Metadata: {
        tenantId: String(run.tenantId),
        requestId: String(run.requestId),
      },
    });

    try {
      await this.client.send(command);
      return ok(entry);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to archive run'));
    }
  }

  async restore(runId: string): Promise<Result<ControlRunRecord | undefined, Error>> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: `restore-index/${runId}.json`,
    });

    try {
      const response = await this.client.send(command);
      const raw = await readBody(response.Body);
      if (!raw) return ok(undefined);
      const parsed: PlanArchiveEntry = JSON.parse(raw);
      return ok(parsed.payload);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to restore run'));
    }
  }

  async delete(runId: string, tenantId: string): Promise<Result<void, Error>> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: `${tenantId}/${runId}.json`,
    });
    try {
      await this.client.send(command);
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to delete run archive'));
    }
  }
}
