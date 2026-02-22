import { putJsonObject, readJsonObject, computeKeyHash } from '@shared/aws-adapters';
import { Result, ok, fail } from '@shared/result';
import { PlanId } from '@domain/failover-orchestration';

export interface SnapshotArchiveOptions {
  bucket: string;
  prefix?: string;
  region?: string;
}

export interface SnapshotArchivePort {
  archive(planId: PlanId, payload: string): Promise<Result<string, Error>>;
  load(planId: PlanId): Promise<Result<string | undefined, Error>>;
}

const planKey = (planId: PlanId, prefix = 'failover') => `${prefix}/${planId}/snapshot.json`;

const encode = (input: string): Uint8Array => new TextEncoder().encode(input);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

export class S3SnapshotArchive implements SnapshotArchivePort {
  constructor(private readonly options: SnapshotArchiveOptions) {}

  async archive(planId: PlanId, payload: string): Promise<Result<string, Error>> {
    try {
      const key = planKey(planId, this.options.prefix);
      await putJsonObject({
        bucket: this.options.bucket,
        key,
        body: encode(payload),
        region: this.options.region,
      });
      const hash = await computeKeyHash(key);
      return ok(`${planId}/${hash}`);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async load(planId: PlanId): Promise<Result<string | undefined, Error>> {
    try {
      const key = planKey(planId, this.options.prefix);
      const out = await readJsonObject(this.options.bucket, key, { region: this.options.region });
      return ok(decode(out.content));
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('NoSuchKey') || message.includes('404')) {
        return ok(undefined);
      }
      return fail(error as Error);
    }
  }
}

export const createFallbackArchive = (bucket: string): SnapshotArchivePort => {
  const inMemory = new Map<string, string>();
  return {
    async archive(planId, payload) {
      const key = planKey(planId, bucket);
      inMemory.set(key, payload);
      return ok(`fallback://${planId}`);
    },
    async load(planId) {
      const key = planKey(planId, bucket);
      return ok(inMemory.get(key));
    },
  };
};
