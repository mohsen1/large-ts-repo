import { z } from 'zod';
import {
  type MeshRoute,
  type MeshRunId,
  type MeshMeta,
  type MeshDispatchInput,
  createRunId,
  createTraceId,
  type MeshStepId,
  createStepId,
} from '@shared/recovery-ops-runtime';
import {
  type ScenarioPolicy,
  type RecoveryPlan,
  type RecoveryPlanInput,
  type ResolutionTrace,
  createDefaultPlan,
  buildPolicy,
  createTrace,
  type EventType,
  type ZoneCode,
  type TenantContext,
  makeTenantId,
} from '@domain/recovery-resilience-models';

const resilienceEventSchema = z.enum(['drift', 'blast', 'depletion', 'throttle', 'saga']);

export const orchestrationRequestSchema = z.object({
  tenantId: z.string().min(3),
  policyId: z.string().min(3),
  zone: z.enum(['zone-east', 'zone-west', 'zone-core']),
  route: z.string().min(4),
  targetEvents: z.array(resilienceEventSchema),
});

export type OrchestrationRequest = z.infer<typeof orchestrationRequestSchema> & {
  targetEvents: EventType[];
  zone: ZoneCode;
  route: MeshRoute;
};

export interface OrchestrationResult {
  readonly runId: MeshRunId;
  readonly route: MeshRoute;
  readonly policy: ScenarioPolicy;
  readonly plan: RecoveryPlan;
  readonly trace: ResolutionTrace;
  readonly channels: readonly string[];
  readonly status: 'queued' | 'running' | 'complete' | 'error';
}

export interface OrchestrationAdapter {
  plan(input: RecoveryPlanInput): Promise<RecoveryPlan>;
  apply(plan: RecoveryPlan): Promise<OrchestrationResult>;
}

export interface OrchestrationPlugin {
  readonly id: string;
  readonly version: `${number}.${number}.${number}`;
  readonly supports: readonly string[];
  resolve(input: OrchestrationRequest): Promise<boolean>;
  run(context: OrchestrationContext, request: OrchestrationRequest): Promise<OrchestrationResult>;
}

export interface OrchestrationContext {
  readonly request: OrchestrationRequest;
  readonly meta: MeshMeta;
  readonly dispatchInput: MeshDispatchInput;
}

const zoneRoute = (zone: ZoneCode): MeshRoute => {
  if (zone === 'zone-east') {
    return 'analysis.zone-east';
  }
  if (zone === 'zone-west') {
    return 'analysis.zone-west';
  }
  return 'analysis.zone-core';
};

export const createDispatchInput = (request: OrchestrationRequest): MeshDispatchInput => ({
  traceId: createTraceId(`trace-${request.zone}`),
  createdAt: Date.now(),
  runId: createRunId('run', request.zone),
  zone: request.zone,
  route: request.route,
  payloadCount: request.targetEvents.length,
  steps: [createStepId('seed', 0)] as readonly MeshStepId[],
});

export const createTenantContext = (request: OrchestrationRequest): TenantContext => ({
  tenantId: makeTenantId(request.tenantId),
  zone: request.zone,
  route: zoneRoute(request.zone),
});

export const createPolicyFromRequest = (request: OrchestrationRequest): ScenarioPolicy =>
  buildPolicy(request.tenantId, [request.zone]);

export const createResult = (
  plan: RecoveryPlan,
  request: OrchestrationRequest,
  status: OrchestrationResult['status'],
): OrchestrationResult => ({
  runId: createRunId('result', request.zone),
  route: request.route,
  policy: plan.policy,
  plan,
  trace: createTrace(request.policyId, [request.route]),
  channels: ['analysis', 'dispatch'],
  status,
});

export const createDefaultPlanFromRequest = (request: OrchestrationRequest): RecoveryPlan =>
  createDefaultPlan(request.tenantId, [request.zone]);

export const makeRequest = (request: OrchestrationRequest): RecoveryPlanInput => ({
  policy: createPolicyFromRequest(request),
  context: createTenantContext(request),
  targetEvents: request.targetEvents,
});
