import { S3Client, type GetObjectCommandInput } from '@aws-sdk/client-s3';
import { readJsonObject, computeKeyHash } from '@shared/aws-adapters';
import { parseDecisionPolicy, type DecisionPolicyTemplate } from '@data/decision-catalog';
import { fail, ok, type Result } from '@shared/result';

export interface S3PolicySource {
  bucket: string;
  key: string;
  region?: string;
}

export interface PolicySnapshot {
  policyId: string;
  tenantId: string;
  loadedAt: string;
  policy: DecisionPolicyTemplate;
}

const decoder = new TextDecoder();

export async function loadPolicyFromS3(client: S3Client, source: S3PolicySource): Promise<Result<PolicySnapshot, string>> {
  try {
    const value = await readJsonObject(source.bucket, source.key);
    const payload = decoder.decode(value.content);
    const parsed = parseDecisionPolicy(JSON.parse(payload));
    if (!parsed.ok) {
      return fail(parsed.error);
    }
    await computeKeyHash(source.key);
    const request: GetObjectCommandInput = { Bucket: source.bucket, Key: source.key };
    void request;
    return ok({
      policyId: parsed.value.id,
      tenantId: parsed.value.tenantId,
      loadedAt: new Date().toISOString(),
      policy: parsed.value,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'invalid policy payload');
  }
}
