import { type Brand, type IsoTimestamp, isoNow } from '@shared/temporal-ops-runtime';
import {
  createOrchestrator,
  type OrchestratorApi,
  type RuntimeOrchestrationOptions,
} from '@service/recovery-temporal-orchestrator';
import type {
  TemporalStudioMode,
  TemporalStudioRow,
  TemporalTimelineEntry,
  TemporalExecutionResult,
} from './types';

const orchestrator: OrchestratorApi = createOrchestrator();

export interface TemporalStudioAdapter {
  runPlan(options: RuntimeOrchestrationOptions): Promise<TemporalExecutionResult>;
  listDiagnostics(tenant: string): Promise<{ readonly runCount: number; readonly hasData: boolean }>;
  loadTimeline(tenant: string): Promise<readonly TemporalTimelineEntry[]>;
}

const buildRows = (runs: ReadonlyArray<{ readonly runId: string }>, mode: TemporalStudioMode): TemporalStudioRow[] => {
  return runs
    .toSorted((left, right) => right.runId.localeCompare(left.runId))
    .map((run, index) => ({
      runId: run.runId as Brand<string, 'RunId'>,
      tenant: 'tenant',
      actor: 'adapter',
      candidateNames: ['a', 'b', 'c'],
      planName: `plan-${index}`,
      mode,
      triggeredAt: isoNow(),
    }));
};

export const createTemporalStudioAdapter = (): TemporalStudioAdapter => {
  return {
    async runPlan(options): Promise<TemporalExecutionResult> {
      const execution = await orchestrator.run(options);
      return {
        runId: execution.runId,
        tenant: execution.tenant,
        startedAt: isoNow(),
        telemetryCount: execution.telemetryCount,
        storeProjection: execution.storeProjection,
      };
    },
    async listDiagnostics(tenant: string) {
      return orchestrator.diagnostics(tenant);
    },
    async loadTimeline(tenant: string): Promise<readonly TemporalTimelineEntry[]> {
      await orchestrator.diagnostics(tenant);
      return [
        {
          stage: 'adapter:bootstrap',
          state: 'complete',
          startedAt: isoNow(),
          endedAt: isoNow(),
          message: `adapter ping ${tenant}`,
        },
        ...buildRows(
          [
            { runId: `run:${tenant}:1` },
            { runId: `run:${tenant}:2` },
          ],
          'runtime',
        ).map((row, index): TemporalTimelineEntry => ({
          stage: row.planName,
          state: index % 2 === 0 ? 'active' : 'pending',
          startedAt: isoNow(),
          message: `${row.actor} · ${row.candidateNames.length} candidates`,
        })),
      ];
    },
  };
};
