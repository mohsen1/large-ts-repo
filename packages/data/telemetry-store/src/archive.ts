import { GetObjectCommand, PutObjectCommand, S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { TelemetryEnvelope } from '@domain/telemetry-models';

export interface ArchiveResult {
  bucket: string;
  key: string;
  bytes: number;
}

export interface ArchiveWriter {
  put(batch: ReadonlyArray<TelemetryEnvelope>): Promise<ArchiveResult>;
}

export interface ArchiveReader {
  get(bucket: string, key: string): Promise<ReadonlyArray<TelemetryEnvelope>>;
}

export class S3ArchiveAdapter implements ArchiveWriter, ArchiveReader {
  private readonly client: S3Client;
  constructor(
    private readonly bucketName: string,
    options: S3ClientConfig = {},
  ) {
    this.client = new S3Client(options);
  }

  async put(batch: ReadonlyArray<TelemetryEnvelope>): Promise<ArchiveResult> {
    const key = `telemetry/${new Date().toISOString()}.jsonl`;
    const body = batch.map((entry) => JSON.stringify(entry)).join('\n');
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }));

    return {
      bucket: this.bucketName,
      key,
      bytes: body.length,
    };
  }

  async get(bucket: string, key: string): Promise<ReadonlyArray<TelemetryEnvelope>> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }));
    const stream = response.Body;
    if (!stream || !(stream instanceof Readable)) {
      return [];
    }
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw.trim()) return [];
    return raw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as TelemetryEnvelope);
  }
}
