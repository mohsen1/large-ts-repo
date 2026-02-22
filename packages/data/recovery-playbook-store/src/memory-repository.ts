import { err, ok, type Result } from '@shared/result';
import type { RecoveryPlaybook, RecoveryPlaybookId, RecoveryPlaybookQuery, PlaybookEnvelope } from '@domain/recovery-playbooks';
import type { RecoveryPlaybookRepository, PaginatedPage, PlaybookQueryCursor, StoredPlaybookRecord } from './repository';

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryRecoveryPlaybookRepository implements RecoveryPlaybookRepository {
  private readonly records = new Map<RecoveryPlaybookId, StoredPlaybookRecord>();

  async save(playbook: RecoveryPlaybook): Promise<Result<PlaybookEnvelope, string>> {
    const id = playbook.id;
    const record: StoredPlaybookRecord = {
      id,
      version: playbook.version,
      labels: [...playbook.labels],
      envelope: {
        playbook: clone(playbook),
        checksum: `checksum-${id}-${Date.now()}`,
      },
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, record);
    return ok(record.envelope);
  }

  async getById(id: RecoveryPlaybookId): Promise<Result<PlaybookEnvelope | undefined, string>> {
    const record = this.records.get(id);
    return ok(record ? clone(record.envelope) : undefined);
  }

  async query(query: RecoveryPlaybookQuery): Promise<Result<PaginatedPage<PlaybookEnvelope>, string>> {
    const filtered = [...this.records.values()]
      .filter((record) => (query.status ? record.envelope.playbook.status === query.status : true))
      .filter((record) => (query.categories ? query.categories.includes(record.envelope.playbook.category) : true))
      .filter((record) => (query.labels ? query.labels.every((label) => record.labels.includes(label)) : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const cursor = Number(query.cursor ?? '0');
    const limit = Math.min(query.limit ?? 25, 1000);
    const start = Number.isNaN(cursor) ? 0 : cursor;
    const page = filtered.slice(start, start + limit);
    const nextCursor = start + page.length < filtered.length ? String(start + page.length) : undefined;

    return ok({
      items: clone(page.map((record) => record.envelope)),
      cursor: nextCursor ? (nextCursor as PlaybookQueryCursor) : undefined,
      hasMore: Boolean(nextCursor),
      total: filtered.length,
    });
  }

  async remove(id: RecoveryPlaybookId): Promise<Result<boolean, string>> {
    return ok(this.records.delete(id));
  }

  async listIds(): Promise<readonly RecoveryPlaybookId[]> {
    return [...this.records.keys()];
  }
}
