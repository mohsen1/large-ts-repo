import { ok } from '@shared/result';
import type { Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { JournalRecord, JournalRecordId, AuditQuery, AutomationJournal, SessionSnapshot } from './models';

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryPlaybookAutomationJournal implements AutomationJournal {
  private readonly records = new Map<JournalRecordId, JournalRecord>();
  private readonly sessionEvents = new Map<string, JournalRecordId[]>();

  async append(record: JournalRecord): Promise<Result<void, string>> {
    const id = withBrand(`${record.runId}:${record.at}:${Math.random().toString(36).slice(2)}`, 'PlaybookJournalRecordId');
    const stored: JournalRecord = { ...record, id };
    this.records.set(id, clone(stored));
    this.sessionEvents.set(stored.runId, [...(this.sessionEvents.get(stored.runId) ?? []), id]);
    return ok(undefined);
  }

  async query(query: AuditQuery): Promise<Result<readonly JournalRecord[], string>> {
    const filtered = [...this.records.values()].filter((record) => {
      if (query.tenantId && record.tenantId !== query.tenantId) return false;
      if (query.runId && record.runId !== query.runId) return false;
      if (query.kinds?.length) return query.kinds.includes(record.kind);
      return true;
    });

    const limit = Math.min(query.limit ?? 250, 500);
    const ordered = filtered.sort((a, b) => a.at.localeCompare(b.at));
    return ok(ordered.slice(0, limit).map((record) => clone(record)));
  }

  async openSession(sessionId: string): Promise<Result<SessionSnapshot, string>> {
    const events = [...this.records.values()].filter((record) => record.runId.startsWith(sessionId));
    const snapshot: SessionSnapshot = {
      sessionId: withBrand(sessionId, 'PlaybookAutomationSessionId'),
      tenantId: events[0]?.tenantId ?? 'tenant-unknown',
      activeRuns: [...new Set(events.map((record) => record.runId))],
      eventCount: events.length,
      lastUpdated: events.at(-1)?.at ?? new Date().toISOString(),
    };
    return ok(snapshot);
  }

  async closeSession(_sessionId: string): Promise<Result<void, string>> {
    return ok(undefined);
  }

  async *events(): AsyncIterableIterator<JournalRecord> {
    for (const record of this.records.values()) {
      await Promise.resolve();
      yield clone(record);
    }
  }
}
