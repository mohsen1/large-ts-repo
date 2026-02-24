import { z } from 'zod';
import type { NoInfer } from '@shared/type-level';
import {
  type ChaosRunMode,
  type ChaosScope,
  type ChaosRunId,
  type ChaosTenantId,
  type ChaosScenarioId,
  type ChaosWorkspaceId,
  type ChaosRunRecord,
  type ChaosSignalEnvelope,
} from '@shared/chaos-lab-console-kernel';
import type { StageBoundary } from '@domain/recovery-chaos-lab';

export const DEFAULT_CONSOLE_TOPK = 8;

export const consoleDashboardInputSchema = z
  .object({
    tenant: z.string().uuid(),
    scenario: z.string().uuid(),
    workspace: z.string().min(3),
    mode: z.enum(['live', 'dry-run', 'forecast']),
    scopes: z
      .array(z.enum(['ingest', 'stage', 'analyze', 'simulate', 'repair', 'observe']))
      .optional(),
    topK: z.number().int().min(1).max(24).default(DEFAULT_CONSOLE_TOPK),
    refreshMs: z.number().int().min(250).max(30_000).default(2000)
  })
  .strict();

export type ConsoleDashboardInput = z.infer<typeof consoleDashboardInputSchema>;

export const consoleCommandSchema = z
  .object({
    command: z.enum(['start', 'pause', 'abort', 'snapshot']),
    target: z.string().optional()
  })
  .strict();

export type ConsoleCommand = z.infer<typeof consoleCommandSchema>;

export interface ConsoleWorkspaceTemplate {
  readonly tenant: ChaosTenantId;
  readonly scenario: ChaosScenarioId;
  readonly workspace: ChaosWorkspaceId;
  readonly mode: ChaosRunMode;
  readonly phases: readonly ChaosScope[];
  readonly topK: number;
  readonly refreshMs: number;
}

export interface ConsoleWorkspaceState {
  readonly workspace: ChaosWorkspaceId;
  readonly tenant: ChaosTenantId;
  readonly scenario: ChaosScenarioId;
  readonly mode: ChaosRunMode;
  readonly scopes: readonly ChaosScope[];
  readonly status: 'idle' | 'building' | 'running' | 'paused' | 'failed' | 'complete';
  readonly lastCommand?: ConsoleCommand;
  readonly runs: readonly ChaosRunRecord[];
}

export interface ConsolePlanRequest<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly tenant: ChaosTenantId;
  readonly namespace: string;
  readonly scenario: {
    readonly id: string;
    readonly name: string;
    readonly stages: TStages;
  };
  readonly scopes: readonly ChaosScope[];
  readonly mode: ChaosRunMode;
  readonly topK: number;
  readonly refreshMs: number;
}

export interface ConsolePlanResultManifest {
  readonly runId: ChaosRunId;
  readonly tenant: ChaosTenantId;
  readonly scenarioId: string;
  readonly phases: readonly ChaosScope[];
  readonly startedAt: number;
  readonly completeBy: number;
  readonly metadata: {
    readonly mode: ChaosRunMode;
    readonly scopeCount: number;
    readonly topK: number;
    readonly refreshMs: number;
  };
}

export interface ConsolePlanResult<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly id: string;
  readonly runId: ChaosRunId;
  readonly workspace: ChaosWorkspaceId;
  readonly manifest: ConsolePlanResultManifest;
}

export interface ConsoleRunSummary {
  readonly runId: ChaosRunId;
  readonly workspace: ChaosWorkspaceId;
  readonly phaseCount: number;
  readonly signals: readonly ChaosSignalEnvelope[];
  readonly runCount: number;
  readonly score: number;
}

export interface PluginBinding<T extends StageBoundary<string, unknown, unknown> = StageBoundary<string, unknown, unknown>> {
  readonly id: string;
  readonly kind: T['name'];
  readonly stageIndex: number;
}

export interface AdapterBundle<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly request: ConsolePlanRequest<T>;
  readonly pluginBindings: readonly PluginBinding<T[number]>[];
}

export interface WorkspaceBundle<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly request: ConsolePlanRequest<T>;
  readonly plan: ConsolePlanResult<T>;
  readonly adapter: AdapterBundle<T>;
}

export interface ConsoleWorkspaceEvent {
  readonly workspace: ChaosWorkspaceId;
  readonly runId: ChaosRunId;
  readonly event: Omit<ChaosSignalEnvelope, 'kind'> & { readonly kind: string };
  readonly at: number;
}

export interface ConsoleExecutionResult {
  readonly workspace: ChaosWorkspaceId;
  readonly runId: ChaosRunId;
  readonly phaseTimeline: readonly {
    readonly scope: ChaosScope;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly score: number;
  }[];
  readonly events: readonly ConsoleWorkspaceEvent[];
  readonly score: number;
}

export function normalizeScopes<T extends readonly ChaosScope[] | undefined>(input: T): readonly ChaosScope[] {
  const defaultScopes: ChaosScope[] = ['ingest', 'stage', 'analyze'];
  const scopeList = !input || input.length === 0 ? defaultScopes : [...input];
  return scopeList;
}
