import { S3ObjectMeta, putJsonObject, readJsonObject } from '@shared/aws-adapters';
import { FulfillmentPlan } from '@domain/fulfillment-orchestration';
import { Envelope } from '@shared/protocol';
import { Result, fail, ok, fromPromise } from '@shared/result';

export interface ArchiveAdapter {
  archivePlan(plan: FulfillmentPlan): Promise<Result<string>>;
  loadPlan(bucket: string, key: string): Promise<Result<FulfillmentPlan | undefined>>;
}

export class S3ArchiveAdapter implements ArchiveAdapter {
  constructor(private readonly bucket: string, private readonly region?: string) {}

  async archivePlan(plan: FulfillmentPlan): Promise<Result<string>> {
    try {
      const key = `fulfillment/plans/${plan.id}.json`;
      const content = new TextEncoder().encode(JSON.stringify(plan));
      const etag = await putJsonObject({
        bucket: this.bucket,
        key,
        body: content,
        region: this.region,
      });
      return ok(`${this.bucket}/${key}:${etag}`);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('archive failed'));
    }
  }

  async loadPlan(bucket: string, key: string): Promise<Result<FulfillmentPlan | undefined>> {
    const raw = await fromPromise(readJsonObject(bucket, key, { region: this.region }));
    if (!raw.ok) return fail(raw.error);
    try {
      const decoded = new TextDecoder().decode(raw.value.content);
      return ok(JSON.parse(decoded) as FulfillmentPlan);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('decode failed'));
    }
  }
}

export const archiveNameFromEnvelope = (envelope: Envelope<unknown>): string => {
  const safe = envelope.eventType.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `audit/${safe}/${envelope.id}.json`;
};

export const toMeta = (value: S3ObjectMeta): Record<string, string> => ({
  key: value.key,
  size: `${value.size}`,
  sha: value.sha256,
  modified: value.lastModified,
});
