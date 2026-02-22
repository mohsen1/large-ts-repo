import type {
  ConstraintViolation,
  RecoveryRunId,
  SimulationResult,
  SimulationSummary,
} from '@domain/recovery-simulation-planning';

export type SimulationMetricId = `${RecoveryRunId}:${string}`;

export interface MetricSegment {
  readonly key: string;
  readonly value: number;
  readonly labels: Record<string, string>;
}

export interface SimulationRunRecord {
  readonly id: SimulationMetricId;
  readonly runId: RecoveryRunId;
  readonly simulationId: string;
  readonly summary: SimulationSummary;
  readonly samples: readonly MetricSegment[];
  readonly violations: readonly ConstraintViolation[];
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SimulationHistoryItem {
  readonly runId: RecoveryRunId;
  readonly score: number;
  readonly readinessState: SimulationSummary['readinessState'];
  readonly summary: SimulationSummary;
  readonly generatedAt: string;
}

export interface SimulationQueryFilter {
  readonly tenant?: string;
  readonly runIds?: readonly RecoveryRunId[];
  readonly status?: readonly SimulationSummary['status'][];
  readonly minScore?: number;
  readonly from?: string;
  readonly to?: string;
}

export interface SimulationRecordEnvelope {
  readonly kind: 'start' | 'finish' | 'anomaly';
  readonly payload: SimulationResult;
  readonly receivedAt: string;
}
