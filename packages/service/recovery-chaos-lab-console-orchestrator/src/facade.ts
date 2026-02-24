import { fail, ok, type Result } from '@shared/result';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import {
  type ConsoleDashboardInput,
  type ConsoleExecutionResult,
  type ConsoleRunSummary,
  type ConsoleWorkspaceEvent,
  normalizeScopes
} from './types';
import { summarizeEvents } from './orchestrator';
import { buildConsolePlan } from './adapters';
import { buildRequest, buildWorkspaceTimeline, inferIntent } from './planner';
import { runConsoleSession } from './orchestrator';
import type { ChaosRunMode, ChaosScope } from '@shared/chaos-lab-console-kernel';

export interface ChaosLabConsoleContext<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly tenant: string;
  readonly scenario: string;
  readonly workspace: string;
  readonly scopes: readonly string[];
  readonly mode: ChaosRunMode;
  readonly intent: ReturnType<typeof inferIntent>;
  readonly topK: number;
  readonly refreshMs: number;
  readonly stages: T;
}

export interface ChaosLabConsoleDiagnostics {
  readonly eventCount: number;
  readonly timelineMs: number;
  readonly phaseCount: number;
  readonly entropy: number;
}

export interface ChaosLabConsoleSessionResult {
  readonly execution: ConsoleExecutionResult;
  readonly diagnostics: ChaosLabConsoleDiagnostics;
}

const defaultScopes = ['ingest', 'stage', 'analyze'] as const;

export const fallbackInput = (tenant: string, scenario: string): ConsoleDashboardInput => ({
  tenant,
  scenario,
  workspace: `${tenant}:${scenario}:lab`,
  mode: 'dry-run',
  scopes: [...defaultScopes],
  topK: 8,
  refreshMs: 2_400
});

export function buildFacadeContext<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  tenant: string,
  scenario: string,
  input: ConsoleDashboardInput,
  stages: T
): ChaosLabConsoleContext<T> {
  const request = buildRequest(input, stages);
  return {
    tenant,
    scenario,
    workspace: `workspace:${request.scenario.id}`,
    scopes: request.scopes as readonly string[],
    mode: request.mode,
    intent: inferIntent(request.mode),
    topK: request.topK,
    refreshMs: request.refreshMs,
    stages
  };
}

export function emitDiagnostics(
  scope: string,
  events: readonly ConsoleWorkspaceEvent[],
  timelineMs: number
): ChaosLabConsoleDiagnostics {
  const summary: ConsoleRunSummary = summarizeEvents(scope, events);
  return {
    eventCount: summary.runCount,
    timelineMs,
    phaseCount: summary.phaseCount,
    entropy: Math.max(0, summary.phaseCount) / (timelineMs || 1)
  };
}

export async function draftPlan<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  input: ConsoleDashboardInput,
  stages: T
): Promise<ReturnType<typeof buildConsolePlan>> {
  return buildConsolePlan(input, normalizeScopes(input.scopes) as never);
}

export async function runChaosLabConsoleSession<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  tenant: string,
  scenario: string,
  input: ConsoleDashboardInput,
  stages: T
): Promise<Result<ChaosLabConsoleSessionResult>> {
  const requested = input.tenant && input.scenario && input.workspace ? input : fallbackInput(tenant, scenario);
  const context = buildFacadeContext(tenant, scenario, requested, stages);
  const run = await runConsoleSession(tenant, requested, stages);
  if (!run.ok) {
    return fail(run.error);
  }
  const timeline = buildWorkspaceTimeline(context.scopes as readonly ChaosScope[], context.refreshMs);
  return ok({
    execution: {
      ...run.value,
      score: Math.min(100, run.value.score + context.topK)
    },
    diagnostics: emitDiagnostics(context.workspace, run.value.events, timeline.totalMs)
  });
}

export class ChaosLabConsoleFacade<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly #tenant: string;
  readonly #scenarios: string[] = [];
  readonly #stages: T;
  #lastExecution?: ConsoleExecutionResult;

  constructor(tenant: string, stages: T) {
    this.#tenant = tenant;
    this.#stages = stages;
  }

  trackScenario(scenario: string): void {
    this.#scenarios.push(scenario);
  }

  latestScenario(): string | null {
    return this.#scenarios.at(-1) ?? null;
  }

  async execute(input: ConsoleDashboardInput): Promise<Result<ConsoleExecutionResult>> {
    const scenario = this.#scenarios.at(-1) ?? input.scenario;
    const session = await runChaosLabConsoleSession(this.#tenant, scenario, input, this.#stages as T);
    if (!session.ok) {
      return fail(session.error);
    }
    this.#lastExecution = session.value.execution;
    return ok(this.#lastExecution);
  }

  get lastExecution(): ConsoleExecutionResult | undefined {
    return this.#lastExecution;
  }
}
