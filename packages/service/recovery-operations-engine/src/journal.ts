import type { RecoverySignal, RunPlanSnapshot, RunSession } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryProgram, RecoveryStep } from '@domain/recovery-orchestration';

export type JournalEntryType = 'signal' | 'plan' | 'decision' | 'checkpoint' | 'error';

export interface JournalEntryBase {
  readonly timestamp: string;
  readonly runId: RecoveryRunState['runId'];
  readonly tenant: string;
  readonly type: JournalEntryType;
}

export interface SignalJournalEntry extends JournalEntryBase {
  readonly type: 'signal';
  readonly signalCount: number;
  readonly topSignalIds: readonly string[];
}

export interface PlanJournalEntry extends JournalEntryBase {
  readonly type: 'plan';
  readonly planId: RunPlanSnapshot['id'];
  readonly programId: RecoveryProgram['id'];
  readonly score: number;
}

export interface DecisionJournalEntry extends JournalEntryBase {
  readonly type: 'decision';
  readonly action: 'allow' | 'block' | 'defer';
  readonly reasons: readonly string[];
}

export interface CheckpointJournalEntry extends JournalEntryBase {
  readonly type: 'checkpoint';
  readonly checkpoint: string;
  readonly sessionStatus: RunSession['status'];
}

export interface ErrorJournalEntry extends JournalEntryBase {
  readonly type: 'error';
  readonly code: string;
  readonly detail: string;
}

export type JournalEntry =
  | SignalJournalEntry
  | PlanJournalEntry
  | DecisionJournalEntry
  | CheckpointJournalEntry
  | ErrorJournalEntry;

type RunTimeline = readonly JournalEntry[];

interface JournalState {
  readonly runId: RecoveryRunState['runId'];
  readonly tenant: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entries: RunTimeline;
}

export interface JournalSearch {
  readonly runId?: string;
  readonly type?: JournalEntryType;
  readonly tenant?: string;
}

const emptySearch = <T>(entries: readonly T[]): readonly T[] => entries;

const formatEntry = (entry: JournalEntry): string =>
  `${entry.timestamp}|${entry.tenant}|${entry.type}|${entry.runId}`;

const pickTopSignals = (signals: readonly RecoverySignal[]): readonly string[] =>
  [...signals]
    .sort((a, b) => {
      const severity = b.severity - a.severity;
      if (severity !== 0) return severity;
      return Date.parse(b.detectedAt) - Date.parse(a.detectedAt);
    })
    .slice(0, 5)
    .map((signal) => signal.id);

export class OperationsJournal {
  private readonly stateByRun = new Map<string, JournalState>();
  private readonly archive = new Map<string, RunTimeline>();

  private toRunId = (runId: string): RecoveryRunState['runId'] => withBrand(runId, 'RecoveryRunId');

  getTimeline(runId: string): readonly JournalEntry[] {
    return this.stateByRun.get(runId)?.entries ?? [];
  }

  appendSignal(runId: string, tenant: string, signals: readonly RecoverySignal[]): JournalEntry {
    const entry: SignalJournalEntry = {
      timestamp: new Date().toISOString(),
      runId: this.toRunId(runId),
      tenant,
      type: 'signal',
      signalCount: signals.length,
      topSignalIds: pickTopSignals(signals),
    };

    this.upsert(runId, tenant, entry);
    return entry;
  }

  appendPlan(
    runId: string,
    tenant: string,
    plan: RunPlanSnapshot,
    score: number,
    program: RecoveryProgram,
  ): JournalEntry {
    const entry: PlanJournalEntry = {
      timestamp: new Date().toISOString(),
      runId: this.toRunId(runId),
      tenant,
      type: 'plan',
      planId: plan.id,
      programId: program.id,
      score,
    };
    this.upsert(runId, tenant, entry);
    return entry;
  }

  appendDecision(runId: string, tenant: string, action: DecisionJournalEntry['action'], reasons: readonly string[]): JournalEntry {
    const entry: DecisionJournalEntry = {
      timestamp: new Date().toISOString(),
      runId: this.toRunId(runId),
      tenant,
      type: 'decision',
      action,
      reasons,
    };
    this.upsert(runId, tenant, entry);
    return entry;
  }

  appendCheckpoint(runId: string, tenant: string, checkpoint: string, session: RunSession): JournalEntry {
    const entry: CheckpointJournalEntry = {
      timestamp: new Date().toISOString(),
      runId: this.toRunId(runId),
      tenant,
      type: 'checkpoint',
      checkpoint,
      sessionStatus: session.status,
    };
    this.upsert(runId, tenant, entry);
    return entry;
  }

  appendError(runId: string, tenant: string, code: string, detail: string): JournalEntry {
    const entry: ErrorJournalEntry = {
      timestamp: new Date().toISOString(),
      runId: this.toRunId(runId),
      tenant,
      type: 'error',
      code,
      detail,
    };
    this.upsert(runId, tenant, entry);
    return entry;
  }

  private upsert(runId: string, tenant: string, entry: JournalEntry): void {
    const current = this.stateByRun.get(runId);
    const now = new Date().toISOString();
    const next = current
      ? { ...current, updatedAt: now, entries: [...current.entries, entry] }
      : {
          runId: this.toRunId(runId),
          tenant,
          createdAt: now,
          updatedAt: now,
          entries: [entry] as readonly JournalEntry[],
        };
    this.stateByRun.set(runId, next);
    this.archive.set(runId, next.entries);
  }

  search(criteria: JournalSearch): readonly JournalEntry[] {
    const all = [...this.archive.values()].flat();
    return emptySearch(
      all.filter((entry) => {
        if (criteria.runId && entry.runId !== criteria.runId) return false;
        if (criteria.type && entry.type !== criteria.type) return false;
        if (criteria.tenant && entry.tenant !== criteria.tenant) return false;
        return true;
      }),
    );
  }

  summarize(runId: string): string[] {
    const entries = this.getTimeline(runId);
    if (entries.length === 0) {
      return [`${runId}:no entries`];
    }
    return entries.map(formatEntry);
  }
}

export const createJournal = (): OperationsJournal => new OperationsJournal();
