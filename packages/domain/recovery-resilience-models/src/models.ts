import { z } from 'zod';
import { Brand, NoInfer, OmitNever, RecursiveTupleKeys } from '@shared/type-level';
import {
  makeScenarioId,
  type ResilienceStepId,
  type ZoneCode,
  type ScenarioId,
  type EventType,
  type TenantContext,
} from './ids';
import { makeTenantId, resolveSeverity, tenantAwareMeta } from './ids';

export const severitySchema = z.union([
  z.literal('low'),
  z.literal('elevated'),
  z.literal('critical'),
]);

export type Severity = z.infer<typeof severitySchema>;

export interface ScenarioPolicy {
  readonly id: Brand<string, 'scenario-policy-id'>;
  readonly zone: ZoneCode;
  readonly targetZones: readonly ZoneCode[];
  readonly channels: readonly string[];
  readonly confidenceFloor: number;
  readonly canaryPercent: number;
}

export interface RecoveryPlanInput {
  readonly policy: ScenarioPolicy;
  readonly context: TenantContext;
  readonly targetEvents: readonly EventType[];
}

export interface RecoveryPlanStep {
  readonly stepId: ResilienceStepId;
  readonly name: string;
  readonly risk: number;
  readonly expectedThroughput: number;
  readonly requiredZones: readonly ZoneCode[];
}

export interface RecoveryPlan {
  readonly scenarioId: ScenarioId;
  readonly policy: ScenarioPolicy;
  readonly steps: readonly RecoveryPlanStep[];
  readonly checksum: string;
}

export type StepTuple<T extends readonly RecoveryPlanStep[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends RecoveryPlanStep
    ? readonly [Head, ...StepTuple<Tail extends readonly RecoveryPlanStep[] ? Tail : readonly []>]
    : readonly []
  : readonly [];

export type StepPath = RecursiveTupleKeys<readonly RecoveryPlanStep[]>;

export interface ResolutionTrace {
  readonly runId: Brand<string, 'run-id'>;
  readonly channels: readonly string[];
}

export const buildPolicy = (tenantId: string, zones: readonly ZoneCode[]): ScenarioPolicy => ({
  id: `policy-${tenantId}` as Brand<string, 'scenario-policy-id'>,
  zone: zones[0] ?? 'zone-core',
  targetZones: [...zones],
  channels: ['analysis', 'dispatch'],
  confidenceFloor: 0.4,
  canaryPercent: 12,
});

export const createPlan = <T extends readonly RecoveryPlanStep[]>(
  tenantId: string,
  policy: ScenarioPolicy,
  steps: NoInfer<T>,
): RecoveryPlan & { steps: T } => {
  const normalized = steps.map((step) => ({
    ...step,
    expectedThroughput: Math.max(0.1, step.expectedThroughput),
  }));

  const seed = normalized
    .map((step) => `${step.stepId}:${step.risk.toFixed(2)}:${step.expectedThroughput}`)
    .join('|');

  let checksum = 0;
  for (let index = 0; index < seed.length; index += 1) {
    checksum = ((checksum << 5) - checksum + seed.charCodeAt(index)) | 0;
  }

  return {
    scenarioId: makeScenarioId(`${tenantId}-${policy.id}`),
    policy,
    steps: normalized as unknown as T,
    checksum: String(Math.abs(checksum)),
  };
};

export const createDefaultPlan = (tenantId: string, zones: readonly ZoneCode[]): RecoveryPlan => {
  const policy = buildPolicy(tenantId, zones);
  const steps: readonly RecoveryPlanStep[] = zones.map((zone, index) => ({
    stepId: `${tenantId}-step-${index}` as ResilienceStepId,
    name: `stabilize-${zone}`,
    risk: 0.2 + index * 0.1,
    expectedThroughput: 1 + index,
    requiredZones: [zone],
  }));
  return createPlan<readonly RecoveryPlanStep[]>(tenantId, policy, steps);
};

export const mapSteps = <T extends readonly RecoveryPlanStep[], R>(
  steps: T,
  mapper: <TStep extends RecoveryPlanStep>(step: TStep, index: number) => R,
): R[] => steps.map((step, index) => mapper(step, index));

export const scorePlan = (steps: readonly RecoveryPlanStep[], confidenceFloor = 0.5): number => {
  const base = steps.reduce((sum, step) => sum + step.risk + step.expectedThroughput, 0);
  const normalized = base / Math.max(1, steps.length);
  return normalized >= confidenceFloor ? normalized : normalized * 0.9;
};

export const normalizePolicy = (input: OmitNever<ScenarioPolicy>): ScenarioPolicy => ({
  ...input,
  canaryPercent: Number(Math.min(100, Math.max(0, input.canaryPercent)).toFixed(2)),
  confidenceFloor: Number(Math.min(1, Math.max(0, input.confidenceFloor)).toFixed(4)),
});

export const traceToText = (trace: ResolutionTrace): string => `${trace.runId}::${trace.channels.join(',')}`;

export const planToRuntime = (
  plan: RecoveryPlan,
  tenantId: string,
  confidence = 0.5,
): { status: 'stable' | 'degraded' | 'recovered'; score: number; reason: string } => {
  const score = scorePlan(plan.steps, confidence);
  const status = score > 0.7 ? 'stable' : score > 0.4 ? 'degraded' : 'recovered';
  return {
    status,
    score,
    reason: `${tenantId}: ${plan.steps.length} steps @ ${plan.checksum}`,
  };
};

export const scenarioContext = (tenantId: string, zone: ZoneCode) => {
  const tenant = makeTenantId(tenantId);
  return {
    tenant,
    zones: [zone],
    meta: tenantAwareMeta(tenant, zone),
    policy: buildPolicy(tenant, [zone]),
  };
};

export const createTrace = (runId: string, channels: readonly string[]): ResolutionTrace => ({
  runId: runId as Brand<string, 'run-id'>,
  channels,
});

export const composeSteps = (policy: ScenarioPolicy): readonly RecoveryPlanStep[] =>
  policy.targetZones.map((zone) => {
    const severity = resolveSeverity(0.7);
    const risk = severity === 'critical' ? 0.8 : severity === 'elevated' ? 0.5 : 0.2;
    return {
      stepId: `${policy.id}-${zone}` as ResilienceStepId,
      name: `resolve-${zone}`,
      risk,
      expectedThroughput: 0.5,
      requiredZones: [zone],
    };
  });
