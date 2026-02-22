import type { MessageBus } from '@platform/messaging';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import type { OperationsAnalyticsReport } from '@data/recovery-operations-analytics';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { Brand } from '@shared/core';

export type OperationsObservabilityRunId = Brand<string, 'OperationsObservabilityRunId'>;

export interface OperationsObservabilityInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly repository: RecoveryOperationsRepository;
  readonly intelligenceRepository: IntelligenceRepository;
  readonly bus: MessageBus;
  readonly readinessPlan?: RecoveryReadinessPlan;
}

export interface OperationsObservabilityOutput {
  readonly runId: OperationsObservabilityRunId;
  readonly tenant: string;
  readonly reports: readonly OperationsAnalyticsReport[];
}

export interface FleetPolicy {
  readonly maxBatchSize: number;
  readonly minWindowMinutes: number;
  readonly emitNoDataAsZero: boolean;
}

export interface FleetPolicyOverrides {
  readonly policy?: Partial<FleetPolicy>;
}

export interface ReportPublisher {
  publishRunSnapshot(input: OperationsAnalyticsReport): Promise<void>;
  publishSignal(input: OperationsObservabilityOutput): Promise<void>;
  publishError(tenant: string, error: unknown): Promise<void>;
}

export const defaultFleetPolicy: FleetPolicy = {
  maxBatchSize: 60,
  minWindowMinutes: 60,
  emitNoDataAsZero: true,
};

export interface ObservabilityDeps extends OperationsObservabilityInput {
  readonly policy?: FleetPolicy;
}

export interface RecoveryOperationsObservabilityService {
  observe(tenant: string): Promise<OperationsObservabilityOutput | undefined>;
  observeBatch(tenant: string, windowMinutes: number): Promise<OperationsObservabilityOutput | undefined>;
}
