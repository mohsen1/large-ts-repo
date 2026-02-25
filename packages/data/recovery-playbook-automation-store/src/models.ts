import { z } from 'zod';
import type { Brand } from '@shared/core';
import type { Result } from '@shared/result';
import type { PlaybookAutomationRunId, PlaybookAutomationSessionId, PlaybookAutomationPluginId } from '@domain/recovery-playbook-orchestration-core';

export type JournalRecordId = Brand<string, 'PlaybookJournalRecordId'>;

export type AuditEventKind =
  | 'run-created'
  | 'run-simulated'
  | 'run-executed'
  | 'run-observed'
  | 'run-finalized';

export interface JournalPayload {
  reason?: string;
  priority?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface JournalRecord {
  readonly id: JournalRecordId;
  readonly tenantId: string;
  readonly runId: PlaybookAutomationRunId;
  readonly pluginId?: PlaybookAutomationPluginId;
  readonly kind: AuditEventKind;
  readonly at: string;
  readonly actor: string;
  readonly payload: JournalPayload;
}

export interface AuditRecordCursor {
  readonly cursor: Brand<string, 'PlaybookJournalCursor'>;
  readonly direction: 'forward' | 'backward';
}

export interface AuditQuery {
  readonly tenantId?: string;
  readonly runId?: PlaybookAutomationRunId;
  readonly kinds?: readonly AuditEventKind[];
  readonly cursor?: AuditRecordCursor;
  readonly limit?: number;
}

export interface SessionSnapshot {
  readonly sessionId: PlaybookAutomationSessionId;
  readonly tenantId: string;
  readonly activeRuns: readonly PlaybookAutomationRunId[];
  readonly eventCount: number;
  readonly lastUpdated: string;
}

export interface AutomationJournal {
  append(record: JournalRecord): Promise<Result<void, string>>;
  query(query: AuditQuery): Promise<Result<readonly JournalRecord[], string>>;
  openSession(sessionId: string): Promise<Result<SessionSnapshot, string>>;
  closeSession(sessionId: string): Promise<Result<void, string>>;
  events(): AsyncIterableIterator<JournalRecord>;
}

export const JournalRecordIdSchema = z.string().brand<'PlaybookJournalRecordId'>();

export const AuditTrailSchema = z.object({
  tenantId: z.string(),
  runId: z.string(),
  kind: z.enum(['run-created', 'run-simulated', 'run-executed', 'run-observed', 'run-finalized']),
  at: z.string(),
  actor: z.string(),
  payload: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

export const SessionSnapshotSchema = z.object({
  sessionId: z.string(),
  tenantId: z.string(),
  activeRuns: z.array(z.string()),
  eventCount: z.number().int().min(0),
  lastUpdated: z.string(),
});

export type InferAuditPayload<TRecord extends JournalRecord> = TRecord['payload'];
