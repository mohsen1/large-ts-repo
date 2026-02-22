export type StrategyPhase = 'inbound' | 'simulation' | 'release' | 'validation' | 'postmortem';
export type RiskPosture = 'low' | 'medium' | 'high' | 'critical';
export type StrategyRunStatus = 'planned' | 'running' | 'waiting' | 'completed' | 'blocked';

export type Brand<T extends string> = T & { readonly __brand: unique symbol };
export type StrategyRunId = Brand<string>;
export type OrchestrationTemplateId = Brand<string>;
export type CommandToken = Brand<string>;
export type StrategyDraftId = Brand<string>;

export interface Branded {
  readonly id: string;
}

export interface StrategyTarget {
  readonly targetId: string;
  readonly serviceName: string;
  readonly zone: string;
  readonly ownerTeam: string;
  readonly baselineRtoMinutes: number;
  readonly targetRtoMinutes: number;
  readonly criticality: number;
}

export interface StrategyConstraint {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly optional: boolean;
}

export interface StrategyCommand {
  readonly commandId: string;
  readonly commandType: string;
  readonly targetId: string;
  readonly timeoutSeconds: number;
  readonly retryLimit: number;
  readonly estimatedMinutes: number;
  readonly requiresHumanApproval: boolean;
  readonly token: CommandToken;
  readonly dependencies: readonly string[];
}

export interface StrategyStepNode {
  readonly stepId: string;
  readonly runbook: string;
  readonly phase: StrategyPhase;
  readonly command: StrategyCommand;
  readonly expectedRiskReduction: number;
  readonly maxParallelism: number;
  readonly constraints: readonly StrategyConstraint[];
  readonly canAbort: boolean;
}

export interface StrategyDependency {
  readonly from: string;
  readonly to: readonly string[];
  readonly soft: boolean;
}

export interface StrategyTemplate {
  readonly templateId: OrchestrationTemplateId;
  readonly name: string;
  readonly description: string;
  readonly phase: StrategyPhase;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly targets: readonly StrategyTarget[];
  readonly dependencies: readonly StrategyDependency[];
  readonly steps: readonly StrategyStepNode[];
}

export interface StrategyDraft {
  readonly draftId: string;
  readonly owner: string;
  readonly template: StrategyTemplate;
  readonly requestedAt: string;
  readonly priority: RiskPosture;
  readonly budgetMinutes: number;
  readonly stepsWindow: readonly StrategySimulationWindow[];
}

export interface StrategyPlan {
  readonly strategyId: string;
  readonly templateId: OrchestrationTemplateId;
  readonly draftId: string;
  readonly runbookTokens: readonly CommandToken[];
  readonly windows: readonly StrategySimulationWindow[];
  readonly dependencies: readonly StrategyDependency[];
  readonly executionPriority: readonly string[];
}

export interface StrategyExecutionResult {
  readonly commandId: string;
  readonly status: 'ok' | 'warn' | 'error';
  readonly executedAt: string;
  readonly durationSeconds: number;
  readonly outputSummary: string;
}

export interface StrategySimulationWindow {
  readonly minuteOffset: number;
  readonly riskPosture: RiskPosture;
  readonly expectedRto: number;
  readonly commandCount: number;
  readonly signalDensity: number;
}

export interface StrategyRun {
  readonly runId: StrategyRunId;
  readonly templateId: OrchestrationTemplateId;
  readonly draftId: string;
  readonly tenantId: string;
  readonly startedAt: string;
  readonly status: StrategyRunStatus;
  readonly targetIds: readonly string[];
  readonly score: number;
  readonly riskPosture: RiskPosture;
  readonly plan: StrategyPlan;
}

export interface SimulationSummary {
  readonly planId: string;
  readonly scenarioCount: number;
  readonly averageRiskPosture: RiskPosture;
  readonly projectedRecoveryMinutes: number;
  readonly commandDensity: number;
  readonly topRiskSteps: readonly string[];
}

export interface TopologySnapshot {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly levels: readonly number[];
}

export interface StrategyPolicy {
  readonly maxParallelism: number;
  readonly allowedPosture: readonly RiskPosture[];
  readonly commandCostPenalty: number;
  readonly minimumRunbookTokens: number;
}

export interface PlanEnvelope<T> {
  readonly id: string;
  readonly revision: number;
  readonly payload: T;
  readonly checksum: string;
  readonly issuedAt: string;
}

export type StrategyByPhase = {
  [phase in StrategyPhase]: readonly StrategyStepNode[];
};

export const brandStrategyRunId = (raw: string): StrategyRunId => raw as StrategyRunId;
export const brandTemplateId = (raw: string): OrchestrationTemplateId => raw as OrchestrationTemplateId;
export const brandCommandToken = (raw: string): CommandToken => raw as CommandToken;

export type RequiredFields<T> = {
  [K in keyof T]-?: Exclude<T[K], undefined>;
};

