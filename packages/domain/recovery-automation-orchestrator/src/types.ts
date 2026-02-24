import type { Brand, Brand as BrandFactory, JsonValue, Merge } from '@shared/type-level';
import type {
  StageDefinition,
  StageName,
  AutomationPlanTemplate,
  OrchestrationRunId,
  OrchestrationTenant,
} from '@shared/automation-orchestration-runtime';

export type AutomationRunId = OrchestrationRunId;
export type AutomationTenantId = OrchestrationTenant;
export type AutomationStageName = StageName;

export type AutomationScore = Brand<number, 'AutomationScore'>;
export type AutomationScenarioId = Brand<string, 'AutomationScenarioId'>;
export type AutomationCommandId = Brand<string, 'AutomationCommandId'>;
export type AutomationCommandName = `command:${string}`;
export type AutomationStatus = 'queued' | 'in_progress' | 'blocked' | 'completed' | 'failed';

export interface AutomationStatusPayload {
  readonly phase: AutomationStatus;
  readonly step: AutomationStageName;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export interface AutomationCommand<TInput = unknown, TOutput = unknown> {
  readonly id: AutomationCommandId;
  readonly name: AutomationCommandName;
  readonly tenant: AutomationTenantId;
  readonly owner: string;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly status: AutomationStatus;
  readonly score: AutomationScore;
  readonly createdAt: string;
  readonly tags: readonly string[];
}

export interface AutomationStageMeta {
  readonly commandId: AutomationCommandId;
  readonly scenarioId: AutomationScenarioId;
  readonly stage: AutomationStageName;
  readonly attempt: number;
}

export interface AutomationRun {
  readonly id: AutomationRunId;
  readonly tenant: AutomationTenantId;
  readonly scenarioId: AutomationScenarioId;
  readonly status: AutomationStatus;
  readonly stages: readonly AutomationStageName[];
  readonly activeStage?: AutomationStageName;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly score: AutomationScore;
  readonly events: readonly string[];
}

export interface AutomationSummary {
  readonly run: AutomationRun;
  readonly commandCount: number;
  readonly failedStageCount: number;
  readonly riskScore: number;
}

export type StageInputMap<TDefinitions extends readonly StageDefinition[]> = {
  [Definition in TDefinitions[number] as Definition['name']]: Definition['run'] extends (input: infer TInput) => Promise<infer _TOutput>
    ? TInput
    : never;
};

export type StageOutputMap<TDefinitions extends readonly StageDefinition[]> = {
  [Definition in TDefinitions[number] as Definition['name']]: Definition extends StageDefinition<
    Definition['name'] & string,
    any,
    infer TOutput
  >
    ? TOutput
    : never;
};

export interface AutomationCatalogSnapshot {
  readonly tenant: AutomationTenantId;
  readonly plans: readonly AutomationPlanTemplate[];
}

export interface AutomationExecutionConfig {
  readonly tenant: AutomationTenantId;
  readonly includeTelemetry?: boolean;
  readonly dryRun?: boolean;
  readonly timeoutMs: number;
  readonly concurrency: 1 | 2 | 3 | 4 | 8;
}

export interface AutomationEngineState<TConfig extends AutomationExecutionConfig = AutomationExecutionConfig> {
  readonly config: TConfig;
  readonly currentRun?: AutomationRun;
  readonly lastSummary?: AutomationSummary;
  readonly errors: readonly Error[];
}

export type DeepConfig<T extends Record<string, JsonValue>, K extends Record<string, JsonValue>> = Merge<T, K>;

export const isComplete = (status: AutomationStatus): boolean => status === 'completed';

export const isFailure = (status: AutomationStatus): boolean => status === 'failed';

export const toRunStatus = (status: AutomationStatusPayload): AutomationStatus => status.phase;
