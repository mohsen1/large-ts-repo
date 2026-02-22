import { toResult, type PromiseResult, type ResultState } from '@shared/core';
import type { StabilityRunId, StabilitySignalId, ServiceNodeId } from '@domain/recovery-stability-models';
import type {
  StabilityEnvelope,
  StabilitySignal,
  StabilityWindow,
} from '@domain/recovery-stability-models';
import {
  type StabilityRecord,
  type SignalRecord,
  parseStoredSignal,
} from './types';
import { type StabilityFilter } from './types';
import { type StoreFilter, applyFilter } from './query';

export interface StoreMutationOptions {
  readonly dryRun?: boolean;
}

export interface StabilityStore {
  upsertEnvelope(
    envelope: StabilityEnvelope,
    options?: StoreMutationOptions,
  ): PromiseResult<StabilityRecord>;
  appendSignals(input: readonly SignalRecord[]): PromiseResult<readonly StabilitySignalId[]>;
  listRunIds(filter?: StabilityFilter): PromiseResult<readonly StabilityRunId[]>;
  getRun(runId: StabilityRunId): PromiseResult<StabilityRecord | undefined>;
  listSignals(filter?: StoreFilter): PromiseResult<readonly StabilitySignal[]>;
  summarizeServices(runId: StabilityRunId): PromiseResult<Record<ServiceNodeId, number>>;
}

export class InMemoryStabilityStore implements StabilityStore {
  private readonly envelopes = new Map<StabilityRunId, StabilityRecord>();
  private readonly signals = new Map<StabilityRunId, SignalRecord[]>();

  upsertEnvelope(envelope: StabilityEnvelope, options?: StoreMutationOptions): PromiseResult<StabilityRecord> {
    return toResult(async () => {
      if (options?.dryRun) {
        return { ...envelope, createdAt: new Date().toISOString() };
      }
      const next = { ...envelope, createdAt: new Date().toISOString() };
      this.envelopes.set(envelope.id, next);
      return next;
    });
  }

  appendSignals(rawSignals: readonly SignalRecord[]): PromiseResult<readonly StabilitySignalId[]> {
    return toResult(async () => {
      const parsed = rawSignals.map((signal) => parseStoredSignal(signal));
      for (const parsedSignal of parsed) {
        const existing = this.signals.get(parsedSignal.runId) ?? [];
        existing.push({
          ...parsedSignal,
          storedAt: new Date().toISOString(),
        });
        this.signals.set(parsedSignal.runId, existing);
      }
      return parsed.map((signal) => signal.id);
    });
  }

  listRunIds(filter: StabilityFilter = {}): PromiseResult<readonly StabilityRunId[]> {
    return toResult(async () => {
      const allRunIds = [...this.envelopes.keys()];
      return allRunIds.filter((runId) => {
        if (filter.runIds && !filter.runIds.includes(runId)) {
          return false;
        }
        if (filter.minValue !== undefined) {
          const envelope = this.envelopes.get(runId);
          const maxSignal = envelope ? Math.max(...envelope.signals.map((signal) => signal.value)) : 0;
          if (maxSignal < filter.minValue) {
            return false;
          }
        }
        return true;
      });
    });
  }

  getRun(runId: StabilityRunId): PromiseResult<StabilityRecord | undefined> {
    return toResult(async () => {
      return this.envelopes.get(runId);
    });
  }

  listSignals(filter: StoreFilter = {}): PromiseResult<readonly StabilitySignal[]> {
    return toResult(async () => {
      if (!filter.runId) {
        return [];
      }
      const byRun = this.signals.get(filter.runId) ?? [];
      return applyFilter(
        byRun,
        filter,
      ).filter((signal): signal is StabilitySignal => this.isWindowMatch(signal.window, filter.window));
    });
  }

  summarizeServices(runId: StabilityRunId): PromiseResult<Record<ServiceNodeId, number>> {
    return toResult(async () => {
      const grouped: Record<ServiceNodeId, number> = {};
      const byRun = this.signals.get(runId) ?? [];
      for (const signal of byRun) {
        grouped[signal.serviceId] = (grouped[signal.serviceId] ?? 0) + 1;
      }
      return grouped;
    });
  }

  private isWindowMatch(window: StabilityWindow, filterWindow?: StabilityWindow): boolean {
    return filterWindow === undefined || window === filterWindow;
  }
}

export const buildRecord = (envelope: StabilityEnvelope, createdAt: string): StabilityRecord => ({
  ...envelope,
  createdAt,
});

export const normalizeSignal = (input: Omit<SignalRecord, 'storedAt'>): StabilitySignal => ({
  ...input,
});
