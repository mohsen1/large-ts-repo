import {
  type S3ClientConfig,
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { err, ok, type Result } from '@shared/result';
import type { RecoveryPlaybook, RecoveryPlaybookId, RecoveryPlaybookQuery, PlaybookEnvelope } from '@domain/recovery-playbooks';
import { RecoveryPlaybookSchema } from '@domain/recovery-playbooks';
import type { PaginatedPage, PlaybookQueryCursor, RecoveryPlaybookRepository } from './repository';

interface S3PlaybookArchiveOptions {
  bucketName: string;
  keyPrefix?: string;
  region?: string;
}

const readToString = async (body: Readable | ReadableStream | Uint8Array): Promise<string> => {
  if (typeof (body as Readable).pipe === 'function') {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      const stream = body as Readable;
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return '';
};

const objectKey = (prefix: string, id: RecoveryPlaybookId): string => `${prefix}/${id}.json`;

export class S3RecoveryPlaybookArchive implements RecoveryPlaybookRepository {
  private readonly client: S3Client;
  private readonly keyPrefix: string;
  private readonly bucketName: string;

  constructor(private readonly options: S3PlaybookArchiveOptions, config?: S3ClientConfig) {
    this.client = new S3Client({
      region: config?.region ?? options.region ?? 'us-east-1',
      ...config,
    });
    this.keyPrefix = options.keyPrefix?.replace(/\/+$/, '') ?? 'recovery-playbooks';
    this.bucketName = options.bucketName;
  }

  async save(playbook: RecoveryPlaybook): Promise<Result<PlaybookEnvelope, string>> {
    try {
      const parsedPlaybook = RecoveryPlaybookSchema.parse(playbook) as unknown as RecoveryPlaybook;
      const key = objectKey(this.keyPrefix, parsedPlaybook.id);
      const envelope: PlaybookEnvelope = {
        playbook: parsedPlaybook,
        checksum: `s3-${Date.now()}`,
        publishedAt: new Date().toISOString(),
      };
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: JSON.stringify(envelope),
        ContentType: 'application/json',
      }));
      return ok(envelope);
    } catch (error) {
      return err(error instanceof Error ? error.message : 'failed-to-save-playbook');
    }
  }

  async getById(id: RecoveryPlaybookId): Promise<Result<PlaybookEnvelope | undefined, string>> {
    try {
      const data = await this.client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey(this.keyPrefix, id),
      }));
      if (!data.Body) return ok(undefined);
      const raw = await readToString(data.Body as Readable | ReadableStream | Uint8Array);
      const parsed = JSON.parse(raw) as { playbook?: unknown };
      const playbook = RecoveryPlaybookSchema.parse(parsed.playbook ?? parsed) as unknown as RecoveryPlaybook;
      return ok({
        playbook: playbook,
        checksum: `s3-${id}`,
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : 'failed-to-read-playbook');
    }
  }

  async query(
    query: RecoveryPlaybookQuery,
  ): Promise<Result<PaginatedPage<PlaybookEnvelope>, string>> {
    try {
      const raw = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: this.keyPrefix,
        MaxKeys: query.limit,
      }));

      const names = raw.Contents?.map((item) => item.Key).filter((key): key is string => Boolean(key)) ?? [];
      const cursor = Number(query.cursor ?? '0');
      const start = Number.isNaN(cursor) ? 0 : cursor;
      const page = names.slice(start, start + (query.limit ?? 25));

      const items: PlaybookEnvelope[] = [];
      for (const key of page) {
        const id = key.replace(`${this.keyPrefix}/`, '').replace('.json', '') as RecoveryPlaybookId;
        const item = await this.getById(id);
        if (item.ok && item.value) {
          items.push(item.value);
        }
      }

      const nextCursor = start + page.length < names.length ? String(start + page.length) : undefined;
      return ok({
        items: items,
        cursor: nextCursor ? (nextCursor as PlaybookQueryCursor) : undefined,
        hasMore: Boolean(nextCursor),
        total: names.length,
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : 'failed-to-query-playbooks');
    }
  }

  async remove(id: RecoveryPlaybookId): Promise<Result<boolean, string>> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey(this.keyPrefix, id),
      }));
      return ok(true);
    } catch (error) {
      return err(error instanceof Error ? error.message : 'failed-to-delete-playbook');
    }
  }
}
