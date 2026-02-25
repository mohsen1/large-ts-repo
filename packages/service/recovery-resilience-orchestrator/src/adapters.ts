import {
  createDefaultPlan,
  createTrace,
  type EventType,
  type RecoveryPlanInput,
  type RecoveryPlan,
} from '@domain/recovery-resilience-models';
import type { OrchestrationRequest, OrchestrationAdapter, OrchestrationResult } from './contracts';

export interface AdapterProbe {
  pluginId: string;
  confidence: number;
}

export interface ResilienceTelemetry {
  readonly pluginId: string;
  readonly planChecksum: string;
  readonly route: string;
}

const asEventType = (value: string): EventType => {
  switch (value) {
    case 'drift':
    case 'blast':
    case 'depletion':
    case 'throttle':
    case 'saga':
      return value;
    default:
      return 'drift';
  }
};

export const createDefaultAdapter = (): OrchestrationAdapter => ({
  plan: async (input: RecoveryPlanInput): Promise<RecoveryPlan> => {
    return createDefaultPlan(input.context.tenantId, input.policy.targetZones);
  },
  apply: async (plan: RecoveryPlan): Promise<OrchestrationResult> => ({
    runId: `adapter-result-${plan.scenarioId}` as OrchestrationResult['runId'],
    route: 'analysis.core',
    policy: plan.policy,
    plan,
    trace: createTrace(plan.scenarioId, ['analysis', 'dispatch']),
    channels: ['analysis', 'dispatch'],
    status: 'complete',
  }),
});

export const buildProbe = (request: OrchestrationRequest): AdapterProbe => ({
  pluginId: `probe-${request.policyId}`,
  confidence: Math.min(1, request.targetEvents.length / 10 + 0.25),
});

export const toTelemetry = (result: OrchestrationResult): ResilienceTelemetry => ({
  pluginId: `plugin-${result.plan.scenarioId}`,
  planChecksum: result.plan.checksum,
  route: result.route,
});

export const parseIncoming = (input: unknown): OrchestrationRequest => {
  if (typeof input !== 'object' || input === null) {
    throw new Error('invalid request');
  }
  const candidate = input as {
    tenantId: string;
    zone: string;
    route: string;
    targetEvents: string[];
    policyId: string;
  };
  return {
    tenantId: candidate.tenantId,
    zone: candidate.zone as OrchestrationRequest['zone'],
    route: candidate.route as OrchestrationRequest['route'],
    targetEvents: candidate.targetEvents.map(asEventType),
    policyId: candidate.policyId,
  };
};

export const adapterSummary = (adapter: OrchestrationAdapter, request: OrchestrationRequest): string => {
  return `${adapter.constructor?.name ?? 'adapter'}:${request.policyId}`;
};
