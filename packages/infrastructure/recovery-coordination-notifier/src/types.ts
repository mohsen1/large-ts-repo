import type {
  CoordinationTenant,
  CoordinationRunId,
  CoordinationPlanCandidate,
} from '@domain/recovery-coordination';

export interface CoordinationDeliveryPolicy {
  readonly tenant: CoordinationTenant;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly backoffFactor: number;
}

export interface CoordinationDeliveryEvent {
  readonly tenant: CoordinationTenant;
  readonly runId: CoordinationRunId;
  readonly title: string;
  readonly body: string;
  readonly candidate: Pick<CoordinationPlanCandidate, 'id' | 'metadata'>;
  readonly generatedAt: string;
}
