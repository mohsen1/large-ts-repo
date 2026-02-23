import type {
  OrchestrationLab,
  OrchestrationLabEnvelope,
  LabRunRecord,
  LabStoreSnapshot,
  LabQueryFilter,
  OrchestrationLabRecord,
} from './model';
import { queryLabs, queryRuns } from './query';

export interface LabReadModel {
  readonly lab: OrchestrationLab;
  readonly selectedPlanId?: OrchestrationLab['plans'][number]['id'];
  readonly signalCount: number;
  readonly planCount: number;
}

export interface RunReadModel {
  readonly runId: LabRunRecord['runId'];
  readonly labId: OrchestrationLabRecord['envelope']['lab']['id'];
  readonly planId: LabRunRecord['planId'];
  readonly status: LabRunRecord['status'];
  readonly startedAt: LabRunRecord['startedAt'];
  readonly completedAt: LabRunRecord['completedAt'];
  readonly logs: number;
}

export interface StoreReadModel {
  readonly labs: readonly LabReadModel[];
  readonly runs: readonly RunReadModel[];
}

const buildLabModel = (record: OrchestrationLabRecord): LabReadModel => ({
  lab: record.envelope.lab,
  selectedPlanId: record.selectedPlanId,
  signalCount: record.envelope.lab.signals.length,
  planCount: record.envelope.plans.length,
});

const buildRunModel = (run: LabRunRecord): RunReadModel => ({
  runId: run.runId,
  labId: run.labId,
  planId: run.planId,
  status: run.status,
  startedAt: run.startedAt,
  completedAt: run.completedAt,
  logs: run.logs.length,
});

export const materializeReadModel = (
  envelopes: readonly OrchestrationLabRecord[],
  runs: readonly LabRunRecord[],
): StoreReadModel => ({
  labs: envelopes.map(buildLabModel),
  runs: runs.map(buildRunModel),
});

export const queryReadModel = (
  envelopes: readonly OrchestrationLabRecord[],
  runs: readonly LabRunRecord[],
  filter: LabQueryFilter,
): StoreReadModel => {
  const labPages = queryLabs(envelopes.map((entry) => entry.envelope), filter);
  const runPages = queryRuns(runs, filter);

  return {
    labs: labPages.data.map((envelope) => ({
      lab: envelope.lab,
      selectedPlanId: undefined,
      signalCount: envelope.lab.signals.length,
      planCount: envelope.plans.length,
    })),
    runs: runPages.data.map((run) => ({
      runId: run.runId,
      labId: run.labId,
      planId: run.planId,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      logs: run.logs.length,
    })),
  };
};

export const hydrateSnapshot = (snapshot: LabStoreSnapshot): StoreReadModel => ({
  labs: snapshot.labs.map((lab) => ({
    lab,
    selectedPlanId: undefined,
    signalCount: lab.signals.length,
    planCount: lab.plans.length,
  })),
  runs: snapshot.runs.map((run) => ({
    runId: run.runId,
    labId: run.labId,
    planId: run.planId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    logs: run.logs.length,
  })),
});
