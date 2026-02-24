import { toHealthScore, type ChaosScope, type ChaosRunMode } from '@shared/chaos-lab-console-kernel';
import { normalizeScopes, type ConsoleDashboardInput, type ConsolePlanRequest, type ConsolePlanResult } from './types';
import { toTenantId, toWorkspaceId, buildConsolePlan } from './adapters';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import { asScenarioId, asNamespace } from '@domain/recovery-chaos-lab';

export interface ConsolePhaseWindow {
  readonly phase: ChaosScope;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly score: number;
}

export interface WorkspaceTimeline {
  readonly windows: readonly ConsolePhaseWindow[];
  readonly totalMs: number;
}

export interface PlannerEnvelope<TPhases extends readonly ChaosScope[]> {
  readonly workspace: string;
  readonly tenant: string;
  readonly scenarioId: string;
  readonly windows: readonly {
    readonly phase: TPhases[number];
    readonly start: number;
    readonly end: number;
    readonly order: number;
  }[];
}

export interface RuntimeIntent {
  readonly intent: 'stabilize' | 'simulate' | 'analyze';
  readonly priority: 'low' | 'medium' | 'high';
}

export type WindowTuple<T extends readonly ChaosScope[]> = {
  [I in keyof T]: [T[I], I extends keyof T ? number : never];
};

export function buildTimeline<T extends readonly ChaosScope[]>(
  phases: T,
  baseMs = 500,
): PlannerEnvelope<T> {
  const windows: Array<{
    readonly phase: T[number];
    readonly start: number;
    readonly end: number;
    readonly order: number;
  }> = [];
  let cursor = 0;

  for (let i = 0; i < phases.length; i += 1) {
    const start = cursor;
    const end = start + baseMs + i * 50;
    windows.push({
      phase: phases[i],
      start,
      end,
      order: i
    });
    cursor = end + 10;
  }

  const scope = normalizeScopes(phases);
  return {
    workspace: `workspace:${scope.join('-')}`,
    tenant: 'tenant:planner',
    scenarioId: `scenario:${scope[0]}`,
    windows
  };
}

export function buildWorkspaceTimeline<T extends readonly ChaosScope[]>(phases: T, baseMs: number): WorkspaceTimeline {
  const plan = buildTimeline(phases, baseMs);
  const windows = plan.windows.map((entry) => ({
    phase: entry.phase,
    startedAt: entry.start,
    endedAt: entry.end,
    score: toHealthScore(Math.max(0, 100 - entry.order * 9))
  }));

  const totalMs = windows.reduce((sum, item) => sum + (item.endedAt - item.startedAt), 0);
  return { windows, totalMs };
}

export function inferIntent(mode: ChaosRunMode): RuntimeIntent {
  if (mode === 'dry-run') {
    return { intent: 'simulate', priority: 'medium' };
  }
  if (mode === 'forecast') {
    return { intent: 'analyze', priority: 'high' };
  }
  return { intent: 'stabilize', priority: 'high' };
}

export function hasForecastWindow(mode: ChaosRunMode): boolean {
  return mode === 'forecast';
}

export function buildRequest<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  input: ConsoleDashboardInput,
  stages: TStages,
): ConsolePlanRequest<TStages> {
  const normalized = normalizeScopes(input.scopes as readonly ChaosScope[]);
  return {
    tenant: toTenantId(input.tenant),
    namespace: input.tenant,
    scenario: {
      id: input.scenario,
      name: `scenario-${input.scenario}`,
      stages
    },
    scopes: normalized,
    mode: input.mode,
    topK: input.topK,
    refreshMs: input.refreshMs
  };
}

export function buildPlanForWorkspace<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  request: ConsolePlanRequest<TStages>
): ReturnType<typeof buildConsolePlan> {
  return buildConsolePlan(
    {
      tenant: request.tenant,
      scenario: request.scenario.id,
      workspace: request.scenario.name,
      mode: request.mode,
      scopes: [...request.scopes],
      topK: request.topK,
      refreshMs: request.refreshMs
    },
    request.scopes
  );
}

export function summarizeWindowOrder<T extends readonly ChaosScope[]>(scopes: T): WindowTuple<T> {
  return scopes.map((scope, index) => [scope, index] as never) as WindowTuple<T>;
}
