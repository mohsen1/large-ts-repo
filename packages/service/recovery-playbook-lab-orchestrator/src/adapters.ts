import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import type {
  RecoveryPlaybookRepository,
  PlaybookEnvelope,
} from '@data/recovery-playbook-store';
import type { PlaybookLabCandidate, PlaybookLabRunId } from '@domain/recovery-playbook-lab';
import type { PlaybookLabError, PlaybookLabRepositoryAdapter } from './types';
import type { RecoveryPlaybook, RecoveryPlaybookId } from '@domain/recovery-playbooks';
import type { RecoveryPlaybookQuery } from '@domain/recovery-playbooks';

const normalizeTenant = (tenant: string): string => tenant.trim().toLowerCase();

export class PlaybookLabRepositoryBridge implements PlaybookLabRepositoryAdapter {
  constructor(private readonly repository: RecoveryPlaybookRepository) {}

  async queryCandidates(query: RecoveryPlaybookQuery): Promise<Result<readonly PlaybookEnvelope[], PlaybookLabError>> {
    const normalized = {
      ...query,
      tenantId: normalizeTenant(query.tenantId ?? 'global') as RecoveryPlaybookQuery['tenantId'],
    };
    const page = await this.repository.query(normalized);
    if (!page.ok) {
      return fail('repository-missing-playbook');
    }
    return ok(page.value.items);
  }

  async getById(id: RecoveryPlaybookId): Promise<Result<PlaybookEnvelope | undefined, PlaybookLabError>> {
    const item = await this.repository.getById(id);
    return item.ok
      ? ok(item.value)
      : fail('repository-missing-playbook');
  }

  async saveEnvelope(envelope: PlaybookEnvelope): Promise<Result<PlaybookEnvelope, PlaybookLabError>> {
    const saved = await this.repository.save(envelope.playbook);
    if (!saved.ok) {
      return fail('repository-missing-playbook');
    }
    return ok({ ...envelope, playbook: envelope.playbook });
  }
}

export const asPlaybookId = (value: string): RecoveryPlaybookId => withBrand(value, 'RecoveryPlaybookId');

export const mapPlaybookId = (candidate: PlaybookLabCandidate): RecoveryPlaybookId => asPlaybookId(candidate.playbook.id);

export const flattenTenantBuckets = (
  snapshots: readonly PlaybookEnvelope[],
): Record<string, readonly RecoveryPlaybook[]> => {
  const index = new Map<string, RecoveryPlaybook[]>();
  for (const item of snapshots) {
    const tenant = String(item.playbook.tags?.tenant ?? item.playbook.owner ?? 'global');
    const bucket = index.get(tenant) ?? [];
    bucket.push(item.playbook);
    index.set(tenant, bucket);
  }
  return Object.fromEntries(index.entries());
};

export const mergeRunStatus = async <T>(
  task: () => Promise<Result<T, PlaybookLabError>>,
  _runId: PlaybookLabRunId,
): Promise<Result<T, PlaybookLabError>> => {
  const value = await task();
  if (!value.ok) {
    return fail(value.error);
  }
  return value;
};
