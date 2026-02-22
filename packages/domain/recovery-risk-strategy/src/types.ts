import type { Brand } from '@shared/core';
import type { Brand as TypeBrand, DeepReadonly, Merge, Prettify } from '@shared/type-level';

export type RiskStrategyId = Brand<string, 'RiskStrategyId'>;
export type RiskScenarioId = Brand<string, 'RiskScenarioId'>;
export type RiskWindowId = Brand<string, 'RiskWindowId'>;
export type RiskPolicyHandle = Brand<string, 'RiskPolicyHandle'>;
export type RiskSignalId = TypeBrand<string, 'RiskSignalId'>;

export type PolicyDirection = 'defensive' | 'aggressive' | 'adaptive';
export type ResourceClass = 'compute' | 'storage' | 'network' | 'identity' | 'data';
export type ConstraintState = 'inactive' | 'enforced' | 'breached' | 'escalated';
export type ConfidenceBand = 'low' | 'medium' | 'high';
export type SeverityBand = 'green' | 'yellow' | 'red' | 'black';
export type StrategyExecutionState =
  | 'queued'
  | 'ready'
  | 'enriched'
  | 'scored'
  | 'bound'
  | 'published'
  | 'complete'
  | 'failed';

export type RiskContextMeta = Readonly<Record<string, string>>;
export type SeverityTrend = readonly [SeverityBand, number][];

export interface RiskConstraint {
  readonly constraintId: Brand<string, 'RiskConstraintId'>;
  readonly strategyId: RiskStrategyId;
  readonly dimension: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly state: ConstraintState;
  readonly note?: string;
  readonly touchedBy?: string;
  readonly createdAt: string;
}

export interface RiskBudget {
  readonly name: string;
  readonly resourceClass: ResourceClass;
  readonly softCap: number;
  readonly hardCap: number;
  readonly headroomPercent: number;
  readonly allocatedAt: string;
}

export interface ScenarioSignal {
  readonly id: RiskSignalId;
  readonly scenarioId: RiskScenarioId;
  readonly signalName: string;
  readonly score: number;
  readonly observedAt: string;
  readonly confidence: ConfidenceBand;
  readonly metadata: RiskContextMeta;
}

export interface RiskSignalWeight {
  readonly dimension: string;
  readonly weight: number;
  readonly priority: number;
}

export interface StrategyRun {
  readonly runId: RiskWindowId;
  readonly strategyId: RiskStrategyId;
  readonly scenarioId: RiskScenarioId;
  readonly resource: Brand<string, 'ResourceId'>;
  readonly actor: Brand<string, 'ActorId'>;
  readonly direction: PolicyDirection;
  readonly budgets: readonly RiskBudget[];
  readonly constraints: readonly RiskConstraint[];
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly score: number;
  readonly metadata: RiskContextMeta & {
    readonly command: string;
    readonly severity: SeverityBand;
    readonly recommendation: string;
  };
}

export interface StrategyProfile {
  readonly profileId: RiskStrategyId;
  readonly name: string;
  readonly description: string;
  readonly owner: Brand<string, 'TeamId'>;
  readonly scenarios: readonly RiskScenario[];
  readonly weights: readonly RiskSignalWeight[];
  readonly active: boolean;
  readonly createdAt: string;
}

export interface RiskScenario {
  readonly scenarioId: RiskScenarioId;
  readonly strategyId: RiskStrategyId;
  readonly title: string;
  readonly severityBias: number;
  readonly constraints: readonly RiskConstraint[];
  readonly budgets: readonly RiskBudget[];
  readonly policyHandle: RiskPolicyHandle;
  readonly tags: readonly string[];
}

export interface StrategyExecutionContext {
  readonly strategy: StrategyProfile;
  readonly scenario: RiskScenario;
  readonly resource: Brand<string, 'ResourceId'>;
  readonly actor: Brand<string, 'ActorId'>;
}

export interface StrategyCommandInput {
  readonly strategy: StrategyProfile;
  readonly scenario: RiskScenario;
  readonly signals: readonly ScenarioSignal[];
  readonly budgets: readonly RiskBudget[];
  readonly constraints: readonly RiskConstraint[];
}

export interface StrategySignal {
  readonly dimension: string;
  readonly score: number;
  readonly weight: number;
  readonly confidence: ConfidenceBand;
}

export interface StrategySignalPack {
  readonly scenarioId: RiskScenarioId;
  readonly vectors: readonly StrategySignal[];
  readonly constraints: readonly RiskConstraint[];
  readonly budgets: readonly RiskBudget[];
  readonly generatedAt: string;
}

export interface StrategyExecutionLog {
  readonly runId: RiskWindowId;
  readonly state: StrategyExecutionState;
  readonly timestamp: string;
  readonly note: string;
}

export interface StrategyExecutionResult {
  readonly run: StrategyRun;
  readonly vector: StrategySignalPack;
  readonly severityBand: SeverityBand;
  readonly recommendation: string;
  readonly logs: readonly StrategyExecutionLog[];
}

export interface StrategyExecutionSummary {
  readonly runId: RiskWindowId;
  readonly scenarioId: RiskScenarioId;
  readonly score: number;
  readonly severityBand: SeverityBand;
  readonly recommendationCount: number;
  readonly state: StrategyExecutionState;
}

export interface StrategyEnvelope {
  readonly envelopeId: RiskWindowId;
  readonly strategyId: RiskStrategyId;
  readonly payload: StrategySignalPack;
  readonly run: StrategyRun;
  readonly meta: {
    readonly generatedBy: Brand<string, 'ServiceId'>;
    readonly pipelineVersion: string;
  };
}

export type StrategyPlan<TContext extends StrategyExecutionContext = StrategyExecutionContext> = Prettify<
  Merge<
    {
      readonly requiredRunId: RiskWindowId;
      readonly strategy: TContext['strategy'];
      readonly scenario: TContext['scenario'];
      readonly resource: TContext['resource'];
      readonly actor: TContext['actor'];
      readonly signals: readonly ScenarioSignal[];
      readonly maxBudgetPerClass: DeepReadonly<Record<ResourceClass, number>>;
      readonly notes: readonly string[];
      readonly dryRun: boolean;
    },
    { readonly optionalNotes?: readonly string[] }
  >
>;

export interface StrategyExecutionTelemetry {
  readonly windowId: RiskWindowId;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly events: readonly StrategyExecutionLog[];
  readonly totals: SeverityTrend;
}
