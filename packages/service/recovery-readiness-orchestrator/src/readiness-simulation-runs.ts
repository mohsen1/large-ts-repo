import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { makeSimulationRunId, type SimulationCommand, type SimulationWorkspaceSnapshot } from '@domain/recovery-readiness-simulation';

export interface SimulationLogEntry {
  readonly runId: string;
  readonly action: 'start' | 'step' | 'error';
  readonly message: string;
  readonly atUtc: string;
}

export interface SimulationRunRecord {
  readonly runId: string;
  readonly startedAt: string;
  readonly status: 'unknown' | 'running' | 'complete' | 'blocked';
}

export interface SimulationRunStore {
  readonly create: (runId: string) => Result<SimulationRunRecord, Error>;
  readonly markComplete: (runId: string) => Result<SimulationRunRecord, Error>;
  readonly touch: (runId: string, action: 'start' | 'step' | 'error', message: string) => Result<SimulationLogEntry, Error>;
  readonly getRecord: (runId: string) => Result<SimulationRunRecord, Error>;
  readonly list: () => readonly SimulationRunRecord[];
  readonly getLog: (runId: string) => Result<readonly SimulationLogEntry[], Error>;
}

interface PersistedRun {
  readonly runId: string;
  readonly startedAt: string;
  readonly status: SimulationRunRecord['status'];
  readonly log: SimulationLogEntry[];
  readonly snapshot?: SimulationWorkspaceSnapshot;
}

export class InMemorySimulationRunStore implements SimulationRunStore {
  private readonly records = new Map<string, PersistedRun>();

  create(runId: string): Result<SimulationRunRecord, Error> {
    const known = this.records.get(runId);
    if (known) {
      return fail(new Error(`run-exists:${runId}`));
    }

    const record: PersistedRun = {
      runId,
      startedAt: new Date().toISOString(),
      status: 'running',
      log: [
        {
          runId,
          action: 'start',
          message: 'run initialized',
          atUtc: new Date().toISOString(),
        },
      ],
    };

    this.records.set(runId, record);
    return ok({ runId, startedAt: record.startedAt, status: record.status });
  }

  markComplete(runId: string): Result<SimulationRunRecord, Error> {
    const current = this.records.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }

    const next: PersistedRun = {
      ...current,
      status: 'complete',
      log: [...current.log, { runId, action: 'step', message: 'run-complete', atUtc: new Date().toISOString() }],
    };

    this.records.set(runId, next);
    return ok({ runId, startedAt: next.startedAt, status: next.status });
  }

  touch(runId: string, action: 'start' | 'step' | 'error', message: string): Result<SimulationLogEntry, Error> {
    const current = this.records.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }

    const entry: SimulationLogEntry = {
      runId,
      action,
      message,
      atUtc: new Date().toISOString(),
    };

    this.records.set(runId, {
      ...current,
      log: [...current.log, entry],
    });

    return ok(entry);
  }

  getRecord(runId: string): Result<SimulationRunRecord, Error> {
    const current = this.records.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }

    return ok({ runId: current.runId, startedAt: current.startedAt, status: current.status });
  }

  list(): readonly SimulationRunRecord[] {
    return Array.from(this.records.values()).map((entry) => ({
      runId: entry.runId,
      startedAt: entry.startedAt,
      status: entry.status,
    }));
  }

  getLog(runId: string): Result<readonly SimulationLogEntry[], Error> {
    const current = this.records.get(runId);
    if (!current) {
      return fail(new Error(`run-missing:${runId}`));
    }

    return ok([...current.log]);
  }
}

export const runIdFromCommand = (command: SimulationCommand): string =>
  makeSimulationRunId(`${command.tenant}:${command.runId}`).toString();
