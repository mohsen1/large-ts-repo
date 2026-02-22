import { S3Client } from '@aws-sdk/client-s3';
import { runDecision } from '@domain/decision-orchestration';
import { buildRuntimeCatalog } from './store';
import { loadPolicyFromS3 } from './adapter';
import { InMemoryDecisionStore } from './store';
import type { PolicyRepository } from '@data/decision-catalog';

interface RuntimeDeps {
  repository: PolicyRepository;
  s3Client: S3Client;
}

export interface RuntimeRunRequest {
  tenantId: string;
  policyId: string;
  subjectId: string;
  context: Record<string, unknown>;
}

export async function executeRuntimeRun(request: RuntimeRunRequest, deps: RuntimeDeps): Promise<string> {
  const orchestratorDeps = {
    repository: deps.repository,
    clock: { now: () => new Date().toISOString() },
  };

  const result = await runDecision<Record<string, unknown>>(
    {
      decisionId: `${request.tenantId}:${request.subjectId}:${request.policyId}`,
      tenantId: request.tenantId,
      policyId: request.policyId,
      subjectId: request.subjectId,
      requestedAt: new Date().toISOString(),
      context: request.context,
      priority: 5,
    },
    orchestratorDeps,
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  return `decision=${result.value.policy.id};actors=${result.value.selectedActors};risk=${result.value.riskBucket}`;
}

export async function hydrateFromS3(
  store: InMemoryDecisionStore,
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  const loaded = await loadPolicyFromS3(s3, { bucket, key });
  if (!loaded.ok) return false;
  store.upsert(loaded.value.policyId, loaded.value.policy as Record<string, unknown>);
  return true;
}

export const buildRuntimeFromSeed = (seed?: Record<string, Record<string, unknown>>) => {
  const store = new InMemoryDecisionStore(buildRuntimeCatalog(seed) as any);
  return { store };
};
