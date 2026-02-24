import { fail, ok, type Result } from '@shared/result';
import {
  createRuntimeScope,
  runWithSignals,
  type ChaosRunId,
  type ChaosScope,
  type ChaosWorkspaceId,
  type ChaosTenantId,
  type ChaosEntityId,
  type ChaosRunPhase,
  type ChaosSignalEnvelope,
  type RuntimeSignal
} from '@shared/chaos-lab-console-kernel';
import {
  parseConsoleInput,
  parsePlugins,
  buildConsolePlan,
  createRegistry,
  pluginExecutionScore
} from './adapters';
import {
  ConsoleExecutionResult,
  type ConsoleDashboardInput,
  ConsoleRunSummary,
  type ConsoleWorkspaceEvent
} from './types';
import { buildRequest, buildPlanForWorkspace, buildWorkspaceTimeline, inferIntent } from './planner';
import { runChaosSessionWithStore } from '@service/recovery-chaos-intelligence-orchestrator';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import type { RegistryLike, ChaosRunEvent } from '@service/recovery-chaos-orchestrator';

export interface OrchestratorExecuteOptions {
  readonly plugins?: readonly unknown[];
  readonly dryRun?: boolean;
}

function signalFromRunEvent(
  runId: ChaosRunId,
  scope: ChaosScope,
  event: ChaosRunEvent<string>
): RuntimeSignal {
  const payload = event as unknown as Record<string, unknown>;
  return {
    runId,
    at: event.at as never,
    phase: `phase:${scope}` as ChaosRunPhase,
    event: {
      id: `${runId}:${event.kind}` as ChaosEntityId,
      kind: String(event.kind) as unknown as ChaosSignalEnvelope['kind'],
      tenant: 'tenant:orchestrator' as ChaosTenantId,
      createdAt: new Date().toISOString() as never,
      at: event.at as never,
      payload
    } as ChaosSignalEnvelope<Record<string, unknown>>
  };
}

export class ChaosLabConsoleOrchestrator {
  readonly #tenant: string;

  constructor(tenant: string) {
    this.#tenant = tenant;
  }

  async run<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
    input: ConsoleDashboardInput,
    stages: TStages,
    options: OrchestratorExecuteOptions = {}
  ): Promise<Result<ConsoleExecutionResult>> {
    const parsed = parseConsoleInput(input);
    if (!parsed.ok) {
      return fail(parsed.error);
    }

    const request = buildRequest(parsed.value, stages);
    const planResult = buildPlanForWorkspace(request);
    if (!planResult.ok) {
      return fail(planResult.error);
    }

    const plugins = parsePlugins(options.plugins ?? []);
    if (!plugins.ok) {
      return fail(plugins.error);
    }

    const registry: RegistryLike<TStages> = createRegistry(stages, plugins.value);
    const session = await runChaosSessionWithStore(
      this.#tenant,
      {
        namespace: request.tenant as unknown as string,
        id: request.scenario.id,
        title: request.scenario.name,
        stages,
        version: '1.0.0',
        createdAt: Date.now()
      } as never,
      registry,
      {
        dryRun: options.dryRun ?? request.mode !== 'live',
        topK: request.topK,
        tags: [request.mode]
      } as never,
    );

    if (!session.ok) {
      return fail(session.error);
    }

    const workspaceScope = createRuntimeScope(String(planResult.value.workspace));
    const events = session.value.runtime.events as readonly ChaosRunEvent[];
    const consoleEvents: ConsoleWorkspaceEvent[] = [];

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const scope = request.scopes[index % request.scopes.length] as ChaosScope;
      const runtimeSignal = signalFromRunEvent(planResult.value.runId, scope, event);
      workspaceScope.emit(runtimeSignal);
      consoleEvents.push({
        workspace: planResult.value.workspace,
        runId: planResult.value.runId,
        event: runtimeSignal.event,
        at: event.at
      });
    }

    const score = pluginExecutionScore(consoleEvents.length, stages.length + request.topK);
    const timeline = buildWorkspaceTimeline(planResult.value.manifest.phases, request.refreshMs);

    const telemetry = await runWithSignals(`scope:${planResult.value.workspace}`, [
      {
        runId: planResult.value.runId,
        at: Date.now() as never,
        phase: `phase:${request.scopes[0] ?? 'ingest'}` as ChaosRunPhase,
        event: {
          id: `${planResult.value.runId}:summary` as ChaosEntityId,
          kind: `summary::${request.mode}` as unknown as ChaosSignalEnvelope['kind'],
          tenant: this.#tenant as ChaosTenantId,
          createdAt: new Date().toISOString() as never,
          at: Date.now() as never,
          payload: {
            scopeCount: request.scopes.length,
            score
          }
        } as ChaosSignalEnvelope
      }
    ]);
    if (telemetry.ok && telemetry.value.signals[0]) {
      workspaceScope.emit(telemetry.value.signals[0]);
    }

    const intent = inferIntent(request.mode);
    void intent;

    return ok({
      workspace: planResult.value.workspace,
      runId: planResult.value.runId,
      phaseTimeline: timeline.windows.map((entry) => ({
        scope: entry.phase,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        score: score + Math.round(entry.score) / 100
      })),
      events: consoleEvents,
      score
    });
  }
}

export async function runConsoleSession<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  tenant: string,
  input: ConsoleDashboardInput,
  stages: TStages,
): Promise<Result<ConsoleExecutionResult>> {
  const orchestrator = new ChaosLabConsoleOrchestrator(tenant);
  return orchestrator.run(input, stages as never);
}

export function summarizeEvents(scope: string, events: readonly ConsoleWorkspaceEvent[]): ConsoleRunSummary {
  const runCount = events.length;
  const scores = events.map((event) => Number((event.event as ChaosSignalEnvelope).at ?? 0));
  const score = scores.length === 0 ? 0 : scores.reduce((acc, next) => acc + (next % 100), 0) / scores.length;

  return {
    runId: events[0]?.runId ?? (`run:${scope}` as ChaosRunId),
    workspace: events[0]?.workspace ?? (`workspace:${scope}` as ChaosWorkspaceId),
    phaseCount: Math.max(1, new Set(events.map((event) => String(event.event.kind).split('::')[0])).size),
    signals: events.map((event) => event.event as never),
    runCount,
    score
  };
}
