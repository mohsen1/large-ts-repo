import { ok } from '@shared/result';
import type { Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { JournalRecord, AuditQuery, SessionSnapshot } from '@data/recovery-playbook-automation-store';
import type { PlaybookAutomationSessionId, PlaybookAutomationRunId } from '@domain/recovery-playbook-orchestration-core';
import type { AutomationJournal } from '@data/recovery-playbook-automation-store';

export interface JournalPublisher {
  publish(record: Omit<JournalRecord, 'id'>): Promise<void>;
}

export interface AuditAdapter {
  append(record: Omit<JournalRecord, 'id'>): Promise<Result<void, string>>;
  read(query: AuditQuery): Promise<Result<readonly JournalRecord[], string>>;
}

export interface SessionAdapter {
  open(sessionId: PlaybookAutomationSessionId): Promise<Result<SessionSnapshot, string>>;
  close(sessionId: PlaybookAutomationSessionId): Promise<Result<void, string>>;
}

export class EphemeralAuditAdapter implements AuditAdapter {
  constructor(private readonly publisher: JournalPublisher) {}

  async append(record: Omit<JournalRecord, 'id'>): Promise<Result<void, string>> {
    await this.publisher.publish(record);
    return ok(undefined);
  }

  async read(_query: AuditQuery): Promise<Result<readonly JournalRecord[], string>> {
    return ok([]);
  }
}

export interface DisposableAudit extends AuditAdapter {
  readonly id: PlaybookAutomationSessionId | PlaybookAutomationRunId;
}

export class SessionLease implements DisposableAudit {
  constructor(
    readonly id: PlaybookAutomationSessionId | PlaybookAutomationRunId,
    private readonly journal: AutomationJournal,
  ) {}

  async [Symbol.asyncDispose](): Promise<void> {
    await this.journal.closeSession(String(this.id));
  }

  async append(record: Omit<JournalRecord, 'id'>): Promise<Result<void, string>> {
    return this.journal.append({ ...record, id: withBrand(`${Date.now()}`, 'PlaybookJournalRecordId') });
  }

  async read(): Promise<Result<readonly JournalRecord[], string>> {
    return this.journal.query({ runId: this.id as PlaybookAutomationRunId });
  }
}

export class NoopSessionAdapter implements SessionAdapter {
  async open(sessionId: PlaybookAutomationSessionId): Promise<Result<SessionSnapshot, string>> {
    return {
      ok: true,
      value: {
        sessionId,
        tenantId: 'tenant-default',
        activeRuns: [],
        eventCount: 0,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  async close(sessionId: PlaybookAutomationSessionId): Promise<Result<void, string>> {
    return ok(undefined);
  }
}
