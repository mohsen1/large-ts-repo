import { Brand } from '@shared/core';
import {
  DemandSignal,
  ForecastPlan,
  FulfillmentStressStrategy,
  ForecastWindow,
  WorkloadScenario,
} from '@domain/fulfillment-orchestration-analytics';

export type OrchestrationRunId = Brand<string, 'OrchestrationRunId'>;

export interface OrchestrationRequest {
  tenantId: string;
  productId: string;
  signals: readonly DemandSignal[];
  windows: readonly ForecastWindow[];
  targetSla: number;
}

export interface OrchestrationResult {
  runId: OrchestrationRunId;
  status: 'accepted' | 'degraded' | 'failed' | 'completed';
  plan: ForecastPlan;
  topScenario?: WorkloadScenario;
  score: number;
}

export interface AlertPayload {
  runId: OrchestrationRunId;
  tenantId: string;
  severity: 'info' | 'warning' | 'critical';
  metric: 'ttr' | 'risk' | 'utilization';
  message: string;
}
