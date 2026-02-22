import { Brand } from '@shared/type-level';
import { PlanId, StageId, RunContext } from '@domain/failover-orchestration';

export type CommandId = Brand<string, 'CommandId'>;

export type FailoverCommandType =
  | 'failover-runtime.plan.upsert'
  | 'failover-runtime.plan.ping'
  | 'failover-runtime.plan.execute'
  | 'failover-runtime.stage.start'
  | 'failover-runtime.stage.complete'
  | 'failover-runtime.plan.archive';

export interface FailoverCommandEnvelope<TPayload> {
  commandId: CommandId;
  command: FailoverCommandType;
  correlationId: string;
  tenantId: Brand<string, 'TenantId'>;
  payload: TPayload;
}

export interface UpsertPlanPayload {
  planId: PlanId;
  tenantId: string;
  planJson: string;
  context: RunContext;
}

export interface ExecutePlanPayload {
  planId: PlanId;
  initiatedBy: string;
  requestedAt: string;
}

export interface StageControlPayload {
  planId: PlanId;
  stageId: StageId;
  requestedBy: string;
  reason: string;
}

export type FailoverCommand =
  | FailoverCommandEnvelope<UpsertPlanPayload>
  | FailoverCommandEnvelope<ExecutePlanPayload>
  | FailoverCommandEnvelope<StageControlPayload>
  | FailoverCommandEnvelope<Record<string, never>>;

export const mkCommand = <T>(command: FailoverCommandType, payload: T, tenantId: string): FailoverCommandEnvelope<T> => {
  return {
    commandId: `${Date.now()}-${Math.random().toString(36).slice(2)}` as CommandId,
    command,
    correlationId: `${Date.now()}`,
    tenantId: tenantId as Brand<string, 'TenantId'>,
    payload,
  };
};
