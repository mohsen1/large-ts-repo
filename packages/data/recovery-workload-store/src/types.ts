import type {
  ForecastInput,
  ScenarioForecast,
  WorkloadDependencyGraph,
  PlanningPlan,
  WorkloadNode,
  WorkloadSnapshot,
  WorkloadUnitId,
} from '@domain/recovery-workload-intelligence';
export type {
  ForecastInput,
  ScenarioForecast,
  WorkloadDependencyGraph,
  PlanningPlan,
  WorkloadNode,
  WorkloadSnapshot,
  WorkloadUnitId,
};

export interface WorkloadStoreQuery {
  readonly nodeIds: readonly WorkloadUnitId[];
  readonly region?: string;
  readonly includeDependencies: boolean;
}

export interface UpsertWorkloadRecord {
  readonly node: WorkloadNode;
  readonly snapshots: readonly WorkloadSnapshot[];
  readonly forecastHistory: readonly ScenarioForecast[];
  readonly lastPlan?: PlanningPlan;
}

export interface StoredRecord {
  readonly nodeId: WorkloadUnitId;
  readonly node: WorkloadNode;
  readonly snapshots: readonly WorkloadSnapshot[];
  readonly forecastHistory: readonly ScenarioForecast[];
  readonly lastPlan?: PlanningPlan;
  readonly updatedAt: string;
  readonly createdAt: string;
}

export interface WorkloadRepository {
  readonly upsert: (input: UpsertWorkloadRecord) => Promise<StoredRecord>;
  readonly query: (request: WorkloadStoreQuery) => Promise<readonly StoredRecord[]>;
  readonly getForecastSignal: (nodeId: WorkloadUnitId) => Promise<readonly ScenarioForecast[]>;
  readonly buildFromInputs: (inputs: readonly ForecastInput[]) => Promise<readonly StoredRecord[]>;
}

export interface WorkloadViewRow {
  readonly nodeId: WorkloadUnitId;
  readonly nodeName: string;
  readonly snapshotAt: string;
  readonly riskSignal: number;
  readonly activeForecastCount: number;
}

export interface WorkloadTrendPoint {
  readonly bucket: string;
  readonly value: number;
  readonly criticality: WorkloadNode['criticality'];
}
