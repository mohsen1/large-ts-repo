import { useMemo } from 'react';

import {
  InMemorySimulationMetricsRepository,
  type SimulationQueryFilter,
  queryAcrossTenant,
  foldHistory,
  type SimulationHistoryItem,
  type SimulationRecordEnvelope,
} from '@data/recovery-simulation-metrics';
import { buildPayload, workspaceToRecord } from '@service/recovery-runner';
import { ingestEnvelope } from '@data/recovery-simulation-metrics';
import type { SimulationSummary, SimulationWorkspace } from '@domain/recovery-simulation-planning';

export interface SimulationRecordFilter {
  readonly tenant?: string;
  readonly runId?: string;
  readonly status?: readonly SimulationSummary['status'][];
}

export interface SimulationTelemetryState {
  readonly recent: readonly SimulationSummary[];
  readonly trend: {
    readonly average: number;
    readonly best: SimulationHistoryItem | undefined;
    readonly worst: SimulationHistoryItem | undefined;
    readonly historyCount: number;
  };
}

const telemetryRepository = new InMemorySimulationMetricsRepository();

const toFilter = (input: SimulationRecordFilter): SimulationQueryFilter => ({
  tenant: input.tenant,
  status: input.status,
  from: input.runId,
});

const ensureNumber = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value;
};

export const buildSimulationRecord = async (
  simulations: readonly SimulationSummary[],
  filter: SimulationRecordFilter = {},
): Promise<SimulationTelemetryState> => {
  const query = await queryAcrossTenant(telemetryRepository, toFilter(filter));
  const folded = foldHistory(query);
  return {
    recent: simulations,
    trend: {
      average: ensureNumber(folded.scoreP50),
      best: folded.best,
      worst: folded.worst,
      historyCount: folded.count,
    },
  };
};

export const useRecoveryConsoleTelemetry = (input: {
  readonly simulations: readonly SimulationSummary[];
  readonly filter?: SimulationRecordFilter;
}): SimulationTelemetryState => {
  const filter = input.filter ?? {};

  const state = useMemo<SimulationTelemetryState>(
    () => ({
      recent: input.simulations,
      trend: {
        average: 0,
        best: undefined,
        worst: undefined,
        historyCount: input.simulations.length,
      },
    }),
    [input.simulations],
  );

  void buildSimulationRecord(input.simulations, filter);

  return state;
};

export const hydrateWorkspaceRecords = async (
  summary: SimulationSummary,
  workspace: SimulationWorkspace,
): Promise<void> => {
  const record = workspaceToRecord(summary, workspace, 'global');
  const envelope: SimulationRecordEnvelope = {
    kind: 'finish',
    payload: buildPayload(record).payload,
    receivedAt: new Date().toISOString(),
  };

  await ingestEnvelope(telemetryRepository, envelope);
};
