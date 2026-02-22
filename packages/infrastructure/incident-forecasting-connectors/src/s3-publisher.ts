import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { ForecastDocument } from '@data/incident-forecast-store';

export class ForecastArchiveClient {
  private readonly client: S3Client;

  constructor(
    private readonly bucketName: string,
    region = process.env.AWS_REGION ?? 'us-east-1',
  ) {
    const endpoint = process.env.AWS_ENDPOINT_URL;
    this.client = new S3Client({ region, ...(endpoint ? { endpoint } : {}) });
  }

  async archive(document: ForecastDocument): Promise<Result<string, Error>> {
    const key = `forecasts/${document.tenantId}/${document.id}.json`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(document),
      ContentType: 'application/json',
    });

    try {
      await this.client.send(command);
      return ok(key);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('s3-archive-failed'));
    }
  }
}
