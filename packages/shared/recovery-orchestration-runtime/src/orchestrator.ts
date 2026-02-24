import { createTraceHandle, createAsyncDisposableStack } from './symbols';
import { buildRunId, ConductorRunId, ConductorNamespace } from './ids';
import {
  type ConductorPluginDefinition,
  type ConductorPluginPhase,
  type ConductorPluginResult,
  type ConductorPluginContext,
  type ConductorPluginRegistry,
} from './plugins';
import { collectAsyncIterable } from './iterators';
import { validateWorkflow, createWorkflowDescriptor, WorkflowDescriptor } from './workflow';
import type { ConductorPluginId } from './ids';

type Awaitable<T> = PromiseLike<T> | T;

export interface OrchestrationRunState {
  readonly phase: ConductorPluginPhase;
  readonly pluginId: ConductorPluginId;
  readonly startedAt: string;
  readonly elapsedMs: number;
}

export interface OrchestrationProgress<TPayload> {
  readonly type: 'progress';
  readonly phase: ConductorPluginPhase;
  readonly pluginId: ConductorPluginId;
  readonly stage: number;
  readonly payload: TPayload;
  readonly diagnostics: readonly string[];
}

export interface OrchestrationComplete<TPayload> {
  readonly type: 'complete';
  readonly status: 'complete' | 'cancelled' | 'failed';
  readonly phase: ConductorPluginPhase;
  readonly runId: ConductorRunId;
  readonly stage: number;
  readonly payload: TPayload;
  readonly diagnostics: readonly string[];
}

export type OrchestrationEvent<TPayload> = OrchestrationProgress<TPayload> | OrchestrationComplete<TPayload>;

export interface OrchestrationInput<TInput, TOutput> {
  readonly tenantId: string;
  readonly namespace: ConductorNamespace;
  readonly runIdSeed: string;
  readonly registry: ConductorPluginRegistry<readonly ConductorPluginDefinition[]>;
  readonly phaseOrder?: readonly ConductorPluginPhase[];
  readonly input: TInput;
  readonly signal?: AbortSignal;
  readonly seed?: number;
  readonly onTransition?: (event: OrchestrationStateTransition<unknown>) => Awaitable<void>;
}

export type OrchestrationStateTransition<TInput> = {
  readonly phase: ConductorPluginPhase;
  readonly pluginId: ConductorPluginId;
  readonly index: number;
  readonly input: TInput;
  readonly output: TInput;
};

type ErasedPlugin = ConductorPluginDefinition<unknown, unknown, Record<string, unknown>, ConductorPluginPhase>;

const runPlugin = async (
  plugin: ErasedPlugin,
  context: ConductorPluginContext<Record<string, unknown>>,
  input: unknown,
): Promise<ConductorPluginResult<unknown>> => {
  try {
    return await plugin.run(context, input as never);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [error instanceof Error ? error.message : String(error)],
    };
  }
};

export const createOrchestrationDescriptor = <TDefs extends readonly ConductorPluginDefinition[]>(
  namespace: ConductorNamespace,
  chain: TDefs,
  route: string,
): WorkflowDescriptor<TDefs> => {
  return createWorkflowDescriptor({
    namespace,
    chain,
    route,
    tags: ['orchestrator', route],
  });
};

const createContext = (namespace: ConductorNamespace, runId: ConductorRunId, phase: ConductorPluginPhase) => {
  return {
    namespace,
    runId,
    phase,
    tenantId: namespace,
    startedAt: new Date().toISOString(),
    config: {},
  };
};

const createCompletion = <TOutput>(
  runId: ConductorRunId,
  phase: ConductorPluginPhase,
  stage: number,
  status: 'complete' | 'cancelled' | 'failed',
  payload: TOutput,
  diagnostics: readonly string[],
): OrchestrationComplete<TOutput> => ({
  type: 'complete',
  status,
  phase,
  runId,
  stage,
  payload,
  diagnostics,
});

export const runConductorStream = async function* <TInput, TOutput>(
  input: OrchestrationInput<TInput, TOutput>,
): AsyncGenerator<OrchestrationEvent<TOutput>, OrchestrationComplete<TOutput>, void> {
  const asType = <T>(value: unknown): T => value as T;

  const runId = buildRunId(input.namespace, input.seed ?? 0, input.runIdSeed);
  const descriptor = createOrchestrationDescriptor(input.namespace, input.registry.plugins(), '/runtime/command/conductor');
  const events = validateWorkflow(descriptor);
  if (events.some((entry) => entry.type === 'invalid')) {
    const completed = createCompletion<TOutput>(
      runId,
      'finalize',
      0,
      'failed',
      asType<TOutput>(input.input),
      events.map((entry) => entry.message),
    );
    yield completed;
    return completed;
  }

  await using stack = createAsyncDisposableStack();
  const phaseSequence = input.phaseOrder ?? descriptor.phases;
  const executionOrder = input.registry.sequence(phaseSequence);
  let current: unknown = input.input;
  let stage = 0;

  for (const plugin of executionOrder) {
    if (input.signal?.aborted) {
      const completed = createCompletion(
        runId,
        plugin.phase,
        stage,
        'cancelled',
        asType<TOutput>(current),
        ['execution cancelled'],
      );
      yield completed;
      return completed;
    }

    const startedAt = new Date().toISOString();
    const phaseHandle = createTraceHandle(plugin.id, plugin.phase);
    stack.use(phaseHandle);

    const context = createContext(input.namespace, runId, plugin.phase);
    const result = await runPlugin(plugin as ErasedPlugin, context as ConductorPluginContext<Record<string, unknown>>, current);
    const elapsed = new Date().toISOString();
    const elapsedMs = Date.now() - Date.parse(startedAt);
    const diagnostics = result.diagnostics;

    if (!result.ok) {
      const completed = createCompletion(runId, plugin.phase, stage, 'failed', asType<TOutput>(current), diagnostics);
      yield completed;
      return completed;
    }

    const output = asType<TOutput>(result.payload);
    const transition: OrchestrationStateTransition<TOutput> = {
      phase: plugin.phase,
      pluginId: plugin.id,
      index: stage,
      input: asType<TOutput>(current),
      output,
    };
    await input.onTransition?.(transition);

    current = output;
    yield {
      type: 'progress',
      phase: plugin.phase,
      pluginId: plugin.id,
      stage,
      payload: output,
      diagnostics,
    };
    await collectAsyncIterable(
      (async function* () {
        for (const phase of descriptor.phases) {
          yield {
            phase,
            at: elapsed,
            elapsedMs,
            timestamp: startedAt,
          };
        }
      })(),
    );
    stage += 1;
  }

  const completed = createCompletion(runId, phaseSequence[phaseSequence.length - 1] ?? 'finalize', stage, 'complete', asType<TOutput>(current), [
    'workflow executed',
  ]);
  yield completed;
  return completed;
}

export const runConductorPlan = async <TInput, TOutput>(
  input: OrchestrationInput<TInput, TOutput>,
): Promise<OrchestrationComplete<TOutput>> => {
  const asType = <T>(value: unknown): T => value as T;

  let latest: OrchestrationComplete<TOutput> | undefined;
  for await (const event of runConductorStream(input)) {
    if (event.type === 'complete') {
      latest = event;
    }
  }
  if (latest) {
    return latest;
  }

  return createCompletion(runIdSeed(input), 'finalize', 0, 'failed', asType<TOutput>(input.input), ['no completion event']);
};

const runIdSeed = (input: OrchestrationInput<unknown, unknown>): ConductorRunId => buildRunId(input.namespace, input.seed ?? 0, input.runIdSeed);
