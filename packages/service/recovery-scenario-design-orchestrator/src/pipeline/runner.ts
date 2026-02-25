import { AsyncLocalStorage } from 'node:async_hooks';
import {
  composeChain,
  normalizePipeline,
  pipelineDebug,
  ScenarioRunScope,
  runtimeDefaults,
  checkpointsFromReport,
  type StageChainTemplate,
  type StagePayload,
} from '@shared/scenario-design-kernel';
import { type StageTemplate, type OrchestrationRunContext, type ScenarioTrace } from '@domain/recovery-scenario-design';
import type { StageVerb } from '@shared/scenario-design-kernel';
import type { ScenarioDesignEvent } from '../types';

interface PipelineArtifact<TInput, TOutput> {
  readonly events: readonly ScenarioDesignEvent[];
  readonly scope: ScenarioRunScope;
  readonly output: TOutput;
  readonly diagnostics: ReturnType<typeof checkpointsFromReport<TInput, TOutput>>;
}

const ctxStore = new AsyncLocalStorage<Map<string, unknown>>();

export interface PipelineObserver {
  onDebug(message: string): void;
  onFrame(frame: string): void;
}

export function createObserver(): PipelineObserver {
  return {
    onDebug(message: string): void {
      ctxStore.getStore()?.set('debug', message);
    },
    onFrame(frame: string): void {
      ctxStore.getStore()?.set(`frame:${frame}`, Date.now());
    },
  };
}

export async function runPipelineWithDiagnostics<TInput extends object, TOutput>(
  template: readonly StageTemplate<TInput, TInput, TOutput>[],
  input: TInput,
  context: OrchestrationRunContext<TInput, TOutput>,
  trace: ScenarioTrace,
  observer: PipelineObserver = createObserver(),
): Promise<PipelineArtifact<TInput, TOutput>> {
  const normalized = normalizePipeline(
    template as StageChainTemplate<readonly StageTemplate<StageVerb, unknown, unknown>[]>,
  ) as StageChainTemplate<readonly StageTemplate<StageVerb, unknown, unknown>[]>;
  const debug = pipelineDebug(normalized);

  const chain = await composeChain(normalized);
  const scope = new ScenarioRunScope(runtimeDefaults.namespace);

  await scope.run(async () => {
    for (const entry of debug) {
      observer.onFrame(entry);
      ctxStore.getStore()?.set(entry, Date.now());
    }
  });

  const execution = await chain(input, {
    runId: context.runId,
    traceId: trace.correlationId,
    startedAt: Date.now(),
    parentTrace: trace.correlationId,
  });

  const checkpoints: StagePayload<OrchestrationRunContext<TInput, TOutput>, TInput, TOutput>[] = [];
  for (const line of normalized) {
    observer.onDebug(`checkpoint:${line.id}`);
    const checkpoint: StagePayload<OrchestrationRunContext<TInput, TOutput>, TInput, TOutput> = {
      stageId: line.id,
      status: line.kind === 'audit' ? 'completed' : 'active',
      context,
      input,
      output: execution.output,
      emittedAt: Date.now(),
    };
    checkpoints.push(checkpoint);
  }

  const events: ScenarioDesignEvent[] = [
    {
      type: 'scenario.started',
      scenarioId: context.scenarioId,
      runId: context.runId,
      timestamp: Date.now(),
      payload: { trace: trace.namespace, debug, count: template.length },
    },
    {
      type: 'scenario.completed',
      scenarioId: context.scenarioId,
      runId: context.runId,
      timestamp: Date.now(),
      payload: {
        trace: trace.namespace,
        template: template.length,
        checkpointCount: checkpoints.length,
      },
    },
  ];

  return {
    events,
    scope,
    output: execution.output,
    diagnostics: checkpointsFromReport({
      status: 'done',
      frames: checkpoints,
      elapsedMs: Date.now() - context.startedAt,
    }),
  };
}
