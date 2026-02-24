import type {
  IncidentLabScenario,
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabEnvelope,
  IncidentLabSignal,
} from '@domain/recovery-incident-lab-core';
import type { Result } from '@shared/result';

export type LabStoreError = {
  readonly code: 'not_found' | 'conflict' | 'invalid' | 'io_error';
  readonly message: string;
};

export type LabStoreResult<T> = Result<T, LabStoreError>;

export interface ScenarioRecord {
  readonly scenario: IncidentLabScenario;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlanRecord {
  readonly plan: IncidentLabPlan;
  readonly createdAt: string;
  readonly score: number;
}

export interface RunRecord {
  readonly run: IncidentLabRun;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface EnvelopeRecord {
  readonly envelope: IncidentLabEnvelope;
  readonly createdAt: string;
}

export interface SnapshotFilter {
  readonly scenarioId?: string;
  readonly state?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly nextOffset?: string;
}

export interface LabStoreTelemetry {
  readonly scenarioCount: number;
  readonly planCount: number;
  readonly runCount: number;
  readonly latestSignal?: IncidentLabSignal;
}

export interface StoreQueryOptions {
  readonly limit: number;
  readonly offset: number;
}

export type StoreQuery<T> = (options?: StoreQueryOptions) => Paginated<T>;
