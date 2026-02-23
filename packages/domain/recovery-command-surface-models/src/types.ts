import { withBrand } from '@shared/core';
import type { Brand, DeepReadonly, Merge, NonEmptyArray } from '@shared/type-level';

export const actionKinds = ['stabilize', 'reroute', 'quarantine', 'rollback', 'verify'] as const;
export type ActionKind = (typeof actionKinds)[number];

export const runStates = ['pending', 'scheduled', 'in_flight', 'validated', 'completed', 'failed', 'rolled_back'] as const;
export type RunState = (typeof runStates)[number];

export type CommandSurfaceId = Brand<string, 'CommandSurfaceId'>;
export type CommandSurfacePlanId = Brand<string, 'CommandSurfacePlanId'>;
export type CommandSurfaceRunId = Brand<string, 'CommandSurfaceRunId'>;

export interface SurfaceScope {
  readonly tenant: string;
  readonly region: string;
  readonly zone: string;
  readonly accountId: string;
}

export interface SurfaceActionInput {
  readonly command: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly priority: number;
  readonly expectedDurationMinutes: number;
}

export interface SurfaceActionTemplate {
  readonly id: CommandSurfaceId;
  readonly title: string;
  readonly kind: ActionKind;
  readonly instructions: readonly string[];
  readonly inputs: readonly SurfaceActionInput[];
  readonly safetyTags: readonly string[];
  readonly requiresApproval: boolean;
}

export interface SurfaceDependency {
  readonly from: CommandSurfaceId;
  readonly to: CommandSurfaceId;
  readonly latencyMs: number;
  readonly requiredReadiness: number;
}

export interface SurfacePlan {
  readonly id: CommandSurfacePlanId;
  readonly name: string;
  readonly surface: SurfaceScope;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly commands: readonly SurfaceActionTemplate[];
  readonly dependencies: readonly SurfaceDependency[];
  readonly constraints: Readonly<{
    readonly maxInFlight: number;
    readonly maxRisk: number;
    readonly allowedDowntimeMinutes: number;
  }>;
}

export interface SurfaceRunStep {
  readonly commandId: CommandSurfaceId;
  readonly at: string;
  readonly state: RunState;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly executor: string;
  readonly host: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

export interface SurfaceRun {
  readonly id: CommandSurfaceRunId;
  readonly tenant: string;
  readonly planId: CommandSurfacePlanId;
  readonly scenario: string;
  readonly requestedBy: string;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly state: RunState;
  readonly steps: readonly SurfaceRunStep[];
  readonly signals: readonly SurfaceSignal[];
  readonly riskScore: number;
}

export interface SurfaceSignal {
  readonly key: string;
  readonly value: number;
  readonly unit: 'ms' | 'percent' | 'count' | 'ratio' | 'unknown';
  readonly timestamp: string;
}

export interface SurfaceRule {
  readonly id: Brand<string, 'SurfaceRuleId'>;
  readonly name: string;
  readonly description: string;
  readonly appliesToKind: ReadonlyArray<ActionKind>;
  readonly maxRiskThreshold: number;
  readonly minSignalRatio: number;
  readonly recommendedWindowMinutes: number;
}

export interface SurfacePolicy {
  readonly id: Brand<string, 'SurfacePolicyId'>;
  readonly enabled: boolean;
  readonly rules: readonly SurfaceRule[];
}

export interface SimulationContext {
  readonly run: SurfaceRun;
  readonly currentTimestamp: string;
  readonly globalBudgetMinutes: number;
}

export interface SimulationResult {
  readonly runId: CommandSurfaceRunId;
  readonly predictedFinishAt: string;
  readonly predictedRisk: number;
  readonly projectedSteps: readonly {
    readonly commandId: CommandSurfaceId;
    readonly finishAt: string;
    readonly confidence: number;
  }[];
  readonly warnings: readonly {
    readonly type: string;
    readonly message: string;
    readonly severity: 'low' | 'medium' | 'high';
  }[];
}

export interface SurfaceForecast {
  readonly runId: CommandSurfaceRunId;
  readonly confidence: number;
  readonly projectedSloRisk: number;
  readonly projectedRecoveryMinutes: number;
  readonly recommendedBatchCount: number;
}

export type PlanCommandWindow = readonly [
  start: SurfaceActionTemplate,
  ...SurfaceActionTemplate[],
];

export type NonEmptyPlanCommands = NonEmptyArray<SurfaceActionTemplate>;
export type SurfaceRunSnapshot = DeepReadonly<SurfaceRun>;

export const buildCommandSurfaceId = (scope: string, command: string): CommandSurfaceId =>
  withBrand(`${scope.toLowerCase().trim()}:${command.toLowerCase().replace(/\s+/g, '-')}`, 'CommandSurfaceId');

export const buildSurfacePlanId = (tenant: string, stamp: number): CommandSurfacePlanId =>
  withBrand(`${tenant.toLowerCase()}:${stamp}`, 'CommandSurfacePlanId');

export const buildSurfaceRunId = (planId: CommandSurfacePlanId, suffix: string): CommandSurfaceRunId =>
  withBrand(`${planId}:${suffix}`, 'CommandSurfaceRunId');

export const createDefaultConstraints = (maxRisk: number, maxInFlight: number): SurfacePlan['constraints'] => ({
  maxInFlight,
  maxRisk,
  allowedDowntimeMinutes: 15,
});

export const withPlanId = <T extends { readonly id: string }>(
  item: Omit<T, 'id'>,
  key: string,
): Merge<T, { id: CommandSurfacePlanId }> => ({
  ...item,
  id: buildSurfacePlanId(key, Date.now()),
} as Merge<T, { id: CommandSurfacePlanId }>);
