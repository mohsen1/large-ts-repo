import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';

export interface CacheKey {
  namespace: string;
  key: string;
}

export class S3Cache {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}

  private toKey(value: CacheKey): string {
    return `${value.namespace}/${value.key}`;
  }

  async has(value: CacheKey): Promise<boolean> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: this.toKey(value) });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async get(value: CacheKey): Promise<string | null> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: this.toKey(value) });
    const output = await this.client.send(command);
    if (!output.Body) return null;
    if (typeof output.Body === 'string') return output.Body;
    const bytes = await output.Body.transformToByteArray();
    return Buffer.from(bytes).toString('utf8');
  }

  async set(value: CacheKey, payload: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.toKey(value),
      Body: payload,
      ContentType: 'application/json',
    });
    await this.client.send(command);
  }

  async setFromFile(value: CacheKey, path: string): Promise<void> {
    const body = readFileSync(path, 'utf8');
    await this.set(value, body);
  }
}
