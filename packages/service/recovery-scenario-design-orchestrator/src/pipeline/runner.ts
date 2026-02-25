import { AsyncLocalStorage } from 'node:async_hooks';
import {
  composeChain,
  normalizePipeline,
  pipelineDebug,
  ScenarioRunScope,
  runtimeDefaults,
  checkpointsFromReport,
  type PipelineFrame,
  type StageChainTemplate,
  type StagePayload,
  type StagePlan,
  type ScenarioContext,
  type StageVerb,
} from '@shared/scenario-design-kernel';
import { type StageTemplate, type OrchestrationRunContext, type ScenarioTrace } from '@domain/recovery-scenario-design';
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
  const executionContext: OrchestrationRunContext<TInput, TOutput> = {
    ...context,
    input,
    output: context.output,
  };

  const normalized = normalizePipeline(
    template.map((stage) => adaptTemplateToPlan(stage, executionContext, trace)),
  ) as StageChainTemplate<readonly StagePlan<StageVerb, TInput, TOutput>[]>;
  const debug = pipelineDebug(normalized);

  const chain = (await (composeChain(normalized) as unknown) as (
    input: TInput,
    context: ScenarioContext,
  ) => Promise<{ output: TOutput; report: { status: 'done' | 'partial' | 'stopped'; frames: readonly PipelineFrame<TInput, TOutput>[]; elapsedMs: number } }>);
  const scope = new ScenarioRunScope(runtimeDefaults.namespace);

  await scope.run(async () => {
    for (const entry of debug) {
      observer.onFrame(entry);
      ctxStore.getStore()?.set(entry, Date.now());
    }
  });

  const sharedContext = {
    runId: context.runId as unknown as ScenarioContext['runId'],
    traceId: trace.correlationId as unknown as ScenarioContext['traceId'],
    startedAt: Date.now(),
    parentTrace: trace.correlationId as unknown as ScenarioContext['parentTrace'],
  };

  const execution = await chain(input, sharedContext);

  const checkpoints: PipelineFrame<TInput, TOutput>[] = [];
  for (const line of normalized) {
    observer.onDebug(`checkpoint:${String(line.id)}`);
    const checkpoint: PipelineFrame<TInput, TOutput> = {
      stage: String(line.id),
      kind: line.kind,
      startedAt: Date.now(),
      status: line.kind === 'audit' ? 'skip' : 'ok',
      payload: {
        stageId: line.id as unknown as StagePayload<ScenarioContext, TInput, TOutput>['stageId'],
        status: line.kind === 'audit' ? 'completed' : 'active',
        context,
        input: (execution.output as unknown) as TInput,
        output: execution.output as TOutput,
        emittedAt: Date.now(),
      },
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
    output: execution.output as TOutput,
    diagnostics: checkpointsFromReport({
      status: 'done',
      frames: checkpoints,
      elapsedMs: Date.now() - context.startedAt,
    }),
  };
}

function adaptTemplateToPlan<TInput, TOutput>(
  stage: StageTemplate<TInput, TInput, TOutput>,
  context: OrchestrationRunContext<TInput, TOutput>,
  trace: ScenarioTrace,
): StagePlan<StageVerb, TInput, TOutput> {
  return {
    kind: stage.kind,
    id: stage.id as unknown as StagePlan<StageVerb, TInput, TOutput>['id'],
    dependencies: [],
    config: {} as StagePlan<StageVerb, TInput, TOutput>['config'],
    execute: async (input) => {
      const result = await stage.adapter.transform(context, input, trace);
      if (result.status === 'error') {
        throw result.error;
      }
      if (result.status === 'skip') {
        return input as unknown as TOutput;
      }
      return (result.output ?? input) as TOutput;
    },
  };
}
