import { InMemoryPlaybookAutomationJournal } from './journal';
import {
  AuditTrailSchema,
  type AuditQuery,
  type JournalRecord,
  type JournalRecordId,
} from './models';
import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { PlaybookAutomationRunId } from '@domain/recovery-playbook-orchestration-core';

export * from './models';
export * from './journal';

const defaultJournalSeed = Promise.resolve([
  {
    tenantId: 'tenant-default',
    runId: 'seed-run',
    kind: 'run-created',
    at: new Date().toISOString(),
    actor: 'bootstrap',
    payload: { reason: 'initialization', priority: 1 },
  },
]);

export const createDefaultAuditJournal = async (): Promise<Result<InMemoryPlaybookAutomationJournal, string>> => {
  const seed = await defaultJournalSeed;
  const schemaParse = AuditTrailSchema.array().safeParse(seed);
  if (!schemaParse.success) {
    return fail('seed-validation-failed');
  }

  const journal = new InMemoryPlaybookAutomationJournal();
  for (const item of schemaParse.data) {
    const record: JournalRecord = {
      ...item,
      id: withBrand(`seed-record-${item.runId}:${item.at}`, 'PlaybookJournalRecordId') as JournalRecordId,
      runId: withBrand(item.runId, 'PlaybookAutomationRunId') as PlaybookAutomationRunId,
      pluginId: undefined,
    };
    await journal.append(record);
  }

  return ok(journal);
};

export const readDefaultJournal = async (query: AuditQuery): Promise<Result<readonly JournalRecord[], string>> => {
  const journal = await createDefaultAuditJournal();
  return journal.ok ? journal.value.query(query) : fail(journal.error);
};
