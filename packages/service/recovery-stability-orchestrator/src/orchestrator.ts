import { toResult, type PromiseResult } from '@shared/core';
import type {
  StabilityEnvelope,
  StabilitySignal,
  StabilityRunId,
} from '@domain/recovery-stability-models';
import { buildExecutionWindow, type StabilityCadence, type ExecutionWindow } from '@domain/recovery-stability-models';
import { computeCadencePlan, type ScheduledCadencePlan } from './schedulers';
import { createAdvice, type StabilityAdvice } from './advice';
import {
  InMemoryStabilityStore,
  type StabilityStore,
  type StoreLookup,
} from '@data/recovery-stability-store';

export interface StabilityRunContext {
  readonly runId: StabilityRunId;
  readonly cadence: StabilityCadence;
  readonly cadenceWindow: ExecutionWindow;
  readonly signals: readonly StabilitySignal[];
}

export interface IncidentReadinessSnapshot {
  readonly ready: boolean;
  readonly explanation: string;
}

export interface StabilitySummary {
  readonly runId: StabilityRunId;
  readonly envelope: StabilityAdvice;
  readonly readiness: IncidentReadinessSnapshot;
  readonly signalCount: number;
}

export interface Orchestrator {
  registerEnvelope(envelope: StabilityEnvelope, signals: readonly StabilitySignal[]): PromiseResult<StabilityRunContext>;
  evaluateReadiness(runId: StabilityRunId): PromiseResult<IncidentReadinessSnapshot>;
  summarizeRun(runId: StabilityRunId): PromiseResult<StabilitySummary>;
  listRuns(): PromiseResult<StoreLookup>;
  loadSignals(runId: StabilityRunId): PromiseResult<readonly StabilitySignal[]>;
}

export class StabilityOrchestratorService implements Orchestrator {
  private readonly planByRun = new Map<StabilityRunId, StabilityRunContext>();

  constructor(private readonly store: StabilityStore = new InMemoryStabilityStore()) {}

  registerEnvelope(
    envelope: StabilityEnvelope,
    signals: readonly StabilitySignal[],
  ): PromiseResult<StabilityRunContext> {
    return toResult(async () => {
      const runId = envelope.id;
      const cadenceWindow = buildExecutionWindow(runId, 1);
      const cadence: StabilityCadence = {
        runId,
        enabled: true,
        cadence: 'hourly',
        shift: 'utc-4',
        ownerTeam: 'reliability',
        timezone: 'UTC',
      };

      await this.store.upsertEnvelope(envelope);
      const stampedSignals = signals.map((signal) => ({
        ...signal,
        storedAt: new Date().toISOString(),
      }));
      await this.store.appendSignals(stampedSignals);

      const context: StabilityRunContext = {
        runId,
        cadence,
        cadenceWindow,
        signals,
      };
      this.planByRun.set(runId, context);

      return context;
    });
  }

  evaluateReadiness(runId: StabilityRunId): PromiseResult<IncidentReadinessSnapshot> {
    return toResult(async () => {
      const context = this.planByRun.get(runId);
      if (!context) {
        return {
          ready: false,
          explanation: 'no run context registered',
        };
      }
      const schedule: ScheduledCadencePlan = computeCadencePlan({
        runId,
        signalVolume: context.signals.length,
        priorityBoost: Math.min(10, context.signals.length),
      });
      return {
        ready: schedule.cooldownMinutes <= 30,
        explanation: `${schedule.cadence} cadence with cooldown ${schedule.cooldownMinutes}m`,
      };
    });
  }

  summarizeRun(runId: StabilityRunId): PromiseResult<StabilitySummary> {
    return toResult(async () => {
      const runResult = await this.store.getRun(runId);
      if (!runResult.ok || !runResult.value) {
        throw new Error(`run not found: ${runId}`);
      }
      const signalsResult = await this.loadSignals(runId);
      if (!signalsResult.ok) {
        throw new Error(`failed to load signals: ${runId}`);
      }

      const envelope = createAdvice({
        runId,
        signals: signalsResult.value,
        componentRisks: [],
      });
      const readiness = await this.evaluateReadiness(runId);
      if (!readiness.ok) {
        throw new Error('readiness failure');
      }

      return {
        runId,
        envelope,
        readiness: readiness.value,
        signalCount: signalsResult.value.length,
      };
    });
  }

  listRuns(): PromiseResult<StoreLookup> {
    return toResult(async () => {
      return [...this.planByRun.keys()];
    });
  }

  loadSignals(runId: StabilityRunId): PromiseResult<readonly StabilitySignal[]> {
    return toResult(async () => {
      const allSignals = await this.store.listSignals({ runId });
      if (!allSignals.ok) {
        return [];
      }
      return allSignals.value;
    });
  }
}
