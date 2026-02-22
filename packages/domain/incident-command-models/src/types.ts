import { Brand, NonEmptyArray } from '@shared/type-level';

export type CommandId = Brand<string, 'CommandId'>;
export type ExecutionId = Brand<string, 'ExecutionId'>;
export type WindowId = Brand<string, 'WindowId'>;

export type CommandPriority = 'critical' | 'high' | 'medium' | 'low';
export type CommandStatus = 'planned' | 'simulated' | 'queued' | 'running' | 'blocked' | 'completed' | 'failed';
export type ResourceClass = 'compute' | 'network' | 'storage' | 'auth' | 'database' | 'queue' | 'cdn';

export interface CommandWindow {
  id: WindowId;
  startsAt: string;
  endsAt: string;
  preferredClass: ResourceClass;
  maxConcurrent: number;
}

export interface CommandConstraint {
  id: Brand<string, 'ConstraintId'>;
  commandId: CommandId;
  reason: string;
  hard: boolean;
  tags: readonly string[];
}

export interface CommandDefinition {
  id: CommandId;
  title: string;
  description: string;
  ownerTeam: string;
  priority: CommandPriority;
  window: CommandWindow;
  affectedResources: readonly ResourceClass[];
  dependencies: readonly CommandId[];
  prerequisites: readonly string[];
  constraints: readonly CommandConstraint[];
  expectedRunMinutes: number;
  riskWeight: number;
}

export interface CommandRunSignal {
  name: string;
  unit: string;
  value: number;
  observedAt: string;
}

export interface RecoveryCommand extends CommandDefinition {
  runbook: readonly string[];
  runMode: 'canary' | 'full' | 'shadow';
  retryWindowMinutes: number;
}

export interface CommandExecutionSnapshot {
  executionId: ExecutionId;
  commandId: CommandId;
  runAt: string;
  startedBy: string;
  status: CommandStatus;
  signals: readonly CommandRunSignal[];
  startedWith: Readonly<Pick<CommandDefinition, 'title' | 'priority' | 'riskWeight'>>;
}

export interface CommandPlanStep {
  commandId: CommandId;
  commandTitle: string;
  sequence: number;
  canRunWithParallelism: number;
  status: CommandStatus;
  scheduledWindow: CommandWindow;
  rationale: string;
}

export interface CommandPlan {
  id: Brand<string, 'CommandPlanId'>;
  tenantId: string;
  createdAt: string;
  expiresAt: string;
  requestedBy: string;
  steps: readonly CommandPlanStep[];
  totalRisk: number;
  coverage: number;
  blockedReasons: readonly string[];
}

export interface CommandConstraintContext {
  activePlanSize: number;
  currentLoad: number;
  tenantId: string;
  criticalServices: readonly string[];
}

export interface CommandPolicyEnvelope {
  id: Brand<string, 'PolicyEnvelopeId'>;
  name: string;
  tags: readonly string[];
  commandIds: readonly CommandId[];
  windows: readonly CommandWindow[];
}

export interface ScoredCommand<TCommand extends CommandDefinition = RecoveryCommand> {
  command: TCommand;
  score: number;
  urgency: number;
  risk: number;
}

export interface SimulatedImpact {
  commandId: CommandId;
  commandTitle: string;
  expectedDowntimeMinutes: number;
  confidence: number;
  recoveryCoverage: number;
  blockers: readonly string[];
}

export interface SimulationResult {
  commandPlanId: CommandPlan['id'];
  tenantId: string;
  createdAt: string;
  impacts: readonly SimulatedImpact[];
  residualRisk: number;
  estimatedFinishAt: string;
}

export type CommandGraphNode = {
  id: CommandId;
  command: CommandDefinition;
  dependsOn: readonly CommandId[];
};

export type CommandDependencyChain = NonEmptyArray<CommandId>;

export interface CommandCoverageTarget {
  resource: ResourceClass;
  required: number;
  coveredByPlan: number;
}

export interface CommandCoverageReport {
  totalResources: readonly CommandCoverageTarget[];
  commandCount: number;
  medianRisk: number;
}

export type ConstraintEvaluator<T> = (context: T) => readonly string[];

export interface TimelineBucket {
  bucketAt: string;
  windowId: WindowId;
  demand: number;
  capacity: number;
  saturated: boolean;
}

export interface ExecutionHistory {
  executionId: ExecutionId;
  planId: CommandPlan['id'];
  commandId: CommandId;
  startedAt: string;
  finishedAt?: string;
  status: CommandStatus;
  notes: readonly string[];
  metrics: Record<string, number>;
}
