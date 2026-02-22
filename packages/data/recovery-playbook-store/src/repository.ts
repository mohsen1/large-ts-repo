import type { Brand } from '@shared/type-level';
import type { Result } from '@shared/result';
import type { RecoveryPlaybook, RecoveryPlaybookId, RecoveryPlaybookQuery, PlaybookEnvelope } from '@domain/recovery-playbooks';

export type PlaybookRepositoryStatus = 'idle' | 'warming-up' | 'ready';
export type PlaybookQueryCursor = Brand<string, 'PlaybookQueryCursor'>;

export interface PaginatedPage<T> {
  items: readonly T[];
  cursor?: PlaybookQueryCursor;
  hasMore: boolean;
  total: number;
}

export interface StoredPlaybookRecord {
  id: RecoveryPlaybookId;
  version: string;
  labels: readonly string[];
  envelope: PlaybookEnvelope;
  updatedAt: string;
}

export interface RecoveryPlaybookRepository {
  save(playbook: RecoveryPlaybook): Promise<Result<PlaybookEnvelope, string>>;
  getById(id: RecoveryPlaybookId): Promise<Result<PlaybookEnvelope | undefined, string>>;
  query(query: RecoveryPlaybookQuery): Promise<Result<PaginatedPage<PlaybookEnvelope>, string>>;
  remove(id: RecoveryPlaybookId): Promise<Result<boolean, string>>;
  listIds?(): Promise<readonly RecoveryPlaybookId[]>;
}
