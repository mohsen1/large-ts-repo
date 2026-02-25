import { NoInfer } from '@shared/type-level';
import {
  asRequestId,
  inferSeverityFromScore,
  toDiagnosticSignal,
  type AutonomyScope,
  type AutonomySignalInput,
  type AutonomySignalEnvelope,
  type AutonomyPlan,
  type AutonomyExecutionOutput,
  type PluginContext,
} from '@domain/recovery-autonomy-graph';
import { AutonomyPluginRegistry } from '@domain/recovery-autonomy-graph';

export interface StageMetrics {
  readonly scope: AutonomyScope;
  readonly startedAt: string;
  readonly pluginCount: number;
  readonly elapsedMs: number;
}

export interface PipelineExecution<
  TInput extends AutonomySignalInput = AutonomySignalInput,
  TOutput extends AutonomyExecutionOutput = AutonomyExecutionOutput,
> {
  readonly requestId: string;
  readonly plan: AutonomyPlan;
  readonly outputs: readonly TOutput[];
  readonly signals: readonly TOutput['signal'][];
  readonly metrics: readonly StageMetrics[];
  readonly request: TInput;
}

export const createContext = (request: AutonomySignalInput, scope: AutonomyScope): PluginContext => ({
  tenantId: request.source,
  runId: request.runId,
  graphId: request.graphId,
  scope,
  requestId: asRequestId(`${scope}:${request.runId}:${Date.now()}`),
  startedAt: new Date().toISOString(),
  labels: {
    run: String(request.runId),
    source: request.source,
  },
});

export const executeStage = async <
  TInput extends AutonomySignalInput,
  TOutput extends AutonomyExecutionOutput,
>(
  scope: AutonomyScope,
  plan: AutonomyPlan,
  input: NoInfer<TInput>,
  registry: AutonomyPluginRegistry,
  abort: AbortSignal,
  onOutput?: (output: TOutput) => void,
): Promise<{
  readonly outputs: readonly TOutput[];
  readonly signals: readonly AutonomySignalEnvelope[];
  readonly metric: StageMetrics;
}> => {
  const started = Date.now();
  const plugins = registry.byScope(scope) as readonly {
    readonly id: unknown;
    execute: (input: TInput, context: PluginContext) => Promise<AutonomyExecutionOutput>;
  }[];
  const context = createContext(input, scope);
  const outputs: TOutput[] = [];

  if (!plugins.length) {
    const fallbackSignal = toDiagnosticSignal(
      input,
      0,
      {
        plugin: 'fallback',
        scope,
      },
    );
    const stageOutput = {
      signal: fallbackSignal,
      output: { plugin: 'fallback' },
      diagnostics: ['no-plugins'],
    } as unknown as TOutput;
    onOutput?.(stageOutput);
    return {
      outputs: [stageOutput],
      signals: [fallbackSignal],
      metric: {
        scope,
        startedAt: new Date(started).toISOString(),
        pluginCount: 0,
        elapsedMs: 1,
      },
    };
  }

  for (const plugin of plugins) {
    if (abort.aborted) {
      throw new DOMException('pipeline aborted', 'AbortError');
    }

    const pluginInput = {
      ...input,
      tags: [...input.tags, `plugin:${String(plugin.id)}`],
    } as TInput;

    const pluginOutput = await plugin.execute(pluginInput, context);
    const mapped = {
      signal: {
        ...pluginOutput.signal,
        severity: inferSeverityFromScore(pluginOutput.signal.score),
      },
      output: pluginOutput.output,
      diagnostics: [...pluginOutput.diagnostics, `executed:${String(plugin.id)}`],
    } as unknown as TOutput;

    outputs.push(mapped);
    onOutput?.(mapped);
  }

  return {
    outputs,
    signals: outputs.map((output) => output.signal),
    metric: {
      scope,
      startedAt: new Date(started).toISOString(),
      pluginCount: plugins.length,
      elapsedMs: Math.max(1, Date.now() - started),
    },
  };
};

export const executePlan = async <
  TInput extends AutonomySignalInput,
  TOutput extends AutonomyExecutionOutput,
>(
  plan: AutonomyPlan,
  request: NoInfer<TInput>,
  registry: AutonomyPluginRegistry,
  abort: AbortSignal,
): Promise<PipelineExecution<TInput, TOutput>> => {
  const requestId = `${request.runId}:${Date.now()}`;
  const outputs: TOutput[] = [];
  const metrics: StageMetrics[] = [];
  const signals: AutonomySignalEnvelope[] = [];

  for (const scope of plan.stages) {
    const result = await executeStage<TInput, TOutput>(scope, plan, request, registry, abort, (output) => {
      outputs.push(output);
      signals.push(output.signal);
    });

    metrics.push(result.metric);
  }

  return {
    requestId,
    plan,
    outputs,
    signals,
    metrics,
    request,
  };
};
