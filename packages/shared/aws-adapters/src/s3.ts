import {
  ListBucketsCommand,
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ObjectIdentifier,
} from '@aws-sdk/client-s3';
import { AwsClientOptions, defaultCredentials, normalizeRegion, resolveMetadata } from './client';

export interface S3ObjectMeta {
  key: string;
  size: number;
  sha256: string;
  lastModified: string;
}

export interface S3ReadResult {
  content: Uint8Array;
  etag: string;
  metadata: Record<string, string>;
}

export async function listBuckets(client: S3Client): Promise<string[]> {
  const { Buckets } = await client.send(new ListBucketsCommand({}));
  return (Buckets ?? []).map((bucket: any) => String(bucket.Name ?? '')).filter(Boolean);
}

export async function putJsonObject(args: {
  bucket: string;
  key: string;
  body: Uint8Array;
  region?: string;
  options?: AwsClientOptions;
}): Promise<string> {
  const region = normalizeRegion(args.region);
  const options = {
    region,
    credentials: args.options?.credentials ?? defaultCredentials(args.options?.profile),
  } as const;
  const client = new S3Client(args.options?.endpoint ? { ...options, endpoint: args.options.endpoint } : options);
  await client.send(new PutObjectCommand({
    Bucket: args.bucket,
    Key: args.key,
    Body: args.body,
    ContentType: 'application/json',
    Metadata: {
      source: 'large-ts-repo',
      region,
    },
  }));
  return await computeKeyHash(args.key);
}

export async function readJsonObject(bucket: string, key: string, options?: AwsClientOptions): Promise<S3ReadResult> {
  const region = normalizeRegion(options?.region);
  const clientOptions = {
    region,
    credentials: options?.credentials ?? defaultCredentials(options?.profile),
  } as const;
  const client = new S3Client(options?.endpoint ? { ...clientOptions, endpoint: options.endpoint } : clientOptions);
  const out = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const response: unknown[] = [];
  const bytes = await out.Body?.transformToByteArray?.();
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(out.Metadata ?? {})) {
    meta[k] = String(v ?? '');
  }
  return {
    content: bytes ?? new TextEncoder().encode(''),
    etag: String((out as any).ETag ?? ''),
    metadata: meta,
  };
}

export async function headObject(bucket: string, key: string, options?: AwsClientOptions): Promise<S3ObjectMeta> {
  const region = normalizeRegion(options?.region);
  const clientOptions = {
    region,
    credentials: options?.credentials ?? defaultCredentials(options?.profile),
  } as const;
  const client = new S3Client(options?.endpoint ? { ...clientOptions, endpoint: options.endpoint } : clientOptions);
  const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return {
    key,
    size: Number(out.ContentLength ?? 0),
    sha256: String(out.ChecksumSHA256 ?? ''),
    lastModified: String(out.LastModified?.toISOString?.() ?? new Date(0).toISOString()),
  };
}

export async function deleteMany(bucket: string, keys: readonly string[], options?: AwsClientOptions): Promise<number> {
  const region = normalizeRegion(options?.region);
  const clientOptions = {
    region,
    credentials: options?.credentials ?? defaultCredentials(options?.profile),
  } as const;
  const client = new S3Client(options?.endpoint ? { ...clientOptions, endpoint: options.endpoint } : clientOptions);
  const objects: ObjectIdentifier[] = keys.map((key) => ({ Key: key }));
  let deleted = 0;
  for (const obj of objects) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
    deleted += 1;
  }
  return deleted;
}

export async function computeKeyHash(input: string): Promise<string> {
  const normalized = input.trim();
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  await resolveMetadata({ region: 'us-east-1' });
  return `h-${hash.toString(16).padStart(8, '0')}`;
}
