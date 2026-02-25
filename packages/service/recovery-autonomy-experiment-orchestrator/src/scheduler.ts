import { createDefaultRegistry } from './plugin-registry';
import { executeAndTrack } from './executor';
import { BASELINE_PLUGINS, withPlugins } from './bootstrap';
import type {
  PluginDefinition,
  SchedulerRequest,
  OrchestratorConfig,
  OrchestratorState,
  OrchestrationResult,
  SchedulerRuntime,
  SchedulerRunId,
} from './types';
import { createStore } from '@data/recovery-autonomy-experiment-store';
import { createRuntimeTrace, createRuntime } from '@domain/recovery-autonomy-experiment/src/runtime';
import { createRecordId, createRecordVersion } from '@data/recovery-autonomy-experiment-store/src/types';
import { makePlanId } from '@domain/recovery-autonomy-experiment/src/types';

interface MutableState {
  runId: SchedulerRunId;
  running: boolean;
  completed: boolean;
  phase: string;
}

export const createScheduler = (): SchedulerRuntime => {
  const store = createStore();
  const registry = createDefaultRegistry();
  const trace = createRuntimeTrace(['scheduler', 'init']);
  const state: MutableState = {
    runId: 'run:bootstrap' as SchedulerRunId,
    running: false,
    completed: false,
    phase: 'prepare',
  };

  const bootstrap = async (): Promise<readonly string[]> => {
    const loaded = await withPlugins();
    for (const plugin of BASELINE_PLUGINS) {
      registry.register(plugin as PluginDefinition);
    }
    return [...trace, ...loaded.map((entry) => `${entry.pluginId}:${entry.loadedAt}`)];
  };

  const run = async <TMeta extends Record<string, unknown>>(request: SchedulerRequest<TMeta>): Promise<OrchestrationResult> => {
    const config: OrchestratorConfig = {
      tenantAlias: request.context.tenantLabel,
      maxCycles: 16,
      cycleDelayMs: 5,
    };

    state.runId = request.intent.runId;
    state.running = true;
    state.completed = false;
    state.phase = request.intent.phase;

    const _unused = config.maxCycles;
    await bootstrap();
    const runtime = createRuntime(request.intent.runId);

    const result = await executeAndTrack(
      {
        phases: request.plan.sequence,
        requestId: request.intent.runId,
      },
      registry,
      request,
      request.payload,
    );

    const record = {
      recordId: createRecordId(request.intent.runId),
      experimentId: makePlanId(request.intent.tenantId),
      runId: request.intent.runId,
      status: result.ok ? ('completed' as const) : ('failed' as const),
      plan: request.plan,
      intent: request.intent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: createRecordVersion(1),
    };

    const persisted = await store.upsert(record as never);
    const persistedOk = persisted.ok;

    await runtime[Symbol.asyncDispose]();

    state.running = false;
    state.completed = true;

    return {
      ...result,
      ok: result.ok && persistedOk,
      error: persistedOk ? undefined : new Error('persist failed'),
      state: {
        ...state,
        phase: request.intent.phase,
      } as OrchestratorState,
    };
  };

  return {
    bootstrap,
    run,
    state: { ...state },
  };
};
