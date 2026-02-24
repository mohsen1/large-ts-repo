import { PathValue } from '@shared/type-level';
import { withBrand } from '@shared/core';
import {
  collectBlueprintMetrics,
  createCollector,
  createPlanContext,
  isCriticalLoad,
  makeMetricId,
  type LatticeBlueprintManifest,
  type LatticeContext,
  type LatticeMetricSample,
  type StageDefinition,
  type StageKind,
  type BlueprintStepKind,
} from '@domain/recovery-lattice';
import type { LatticeOrchestratorRequest, StageResult } from './types';
import { asRunId } from '@domain/recovery-lattice';

const toArray = <T>(values: Iterable<T>): readonly T[] => {
  const iteratorFrom = (globalThis as {
    Iterator?: {
      from?: <V>(value: Iterable<V>) => IterableIterator<V>;
    };
  }).Iterator?.from;
  return Array.from(iteratorFrom ? iteratorFrom(values) : values);
};

const routeStageMap: Record<BlueprintStepKind, StageKind> = {
  ingest: 'extract',
  transform: 'synthesize',
  observe: 'evaluate',
  emit: 'publish',
  validate: 'verify',
};

export interface PipelineState {
  readonly steps: readonly string[];
  readonly completed: number;
  readonly errors: readonly string[];
}

export class LatticePipelineEngine<TInput, TOutput = TInput> {
  readonly #stages: readonly StageDefinition<TInput, StageKind>[];

  public constructor(
    private readonly request: LatticeOrchestratorRequest<TInput>,
    stages: readonly StageDefinition<TInput, StageKind>[],
  ) {
    this.#stages = stages;
  }

  public async execute(payload: TInput): Promise<TOutput> {
    const _startedAt = new Date().toISOString();
    const context = (this.request.context ?? createPlanContext(this.request.tenantId)) as LatticeContext;

    const window = createCollector<LatticeContext>(
      this.request.tenantId,
      String(this.request.routeId),
      makeMetricId(this.request.tenantId, String(this.request.routeId)),
      {
        maxSamples: 32,
        windowMs: 45_000,
        thresholds: [25, 75, 150],
      },
    );

    let current: TInput = payload;
    const errors: string[] = [];
    const stages = toArray(this.#stages);

    for (const [index, stage] of stages.entries()) {
      try {
        current = await stage.transform({
          context,
          runId: asRunId(`run:${this.request.routeId}:${index}`),
          trace: withBrand(`trace:${this.request.routeId}:${index}`, 'lattice-trace-id'),
          payload: current,
        });
      } catch (error) {
        errors.push(`${stage.name}:${error instanceof Error ? error.message : 'pipeline-failed'}`);
      }

      const metric: LatticeMetricSample<LatticeContext> = {
        tenantId: this.request.tenantId,
        timestamp: withBrand(new Date().toISOString(), 'lattice-timestamp'),
        name: makeMetricId(this.request.tenantId, stage.name),
        unit: 'count' as const,
        value: errors.length,
        severity: errors.length > 0 ? 'warning' : 'stable',
        context,
        tags: [stage.name],
      };

      if (!isCriticalLoad(metric)) {
        window.record(metric);
      }
    }

    void collectBlueprintMetrics(context, this.request.blueprint, window.snapshot().samples);
    await window[Symbol.asyncDispose]();

    return current as unknown as TOutput;
  }

  public planState(): PipelineState {
    const steps = toArray(this.#stages).map((stage) => stage.name);
    return {
      steps,
      completed: steps.length,
      errors: [...steps].toSorted(),
    };
  }

  public runStepNames(): readonly string[] {
    return toArray(this.#stages).map((stage) => stage.name);
  }
}

export const mapPipelineState = <
  TState extends PipelineState,
  TPath extends keyof TState & keyof object,
>(
  state: TState,
  path: TPath,
): readonly PathValue<TState, TPath>[] => {
  const value = state[path];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [value as PathValue<TState, TPath>] as readonly PathValue<TState, TPath>[];
  }

  const values = [] as PathValue<TState, TPath>[];
  if (Array.isArray(value)) {
    values.push(...(value as readonly PathValue<TState, TPath>[]));
    return values;
  }

  return [value as PathValue<TState, TPath>];
};

export const adaptStages = <
  TInput,
>(
  blueprint: LatticeBlueprintManifest,
  request: LatticeOrchestratorRequest<TInput>,
): readonly StageDefinition<TInput, StageKind>[] => {
  return blueprint.steps.map((step, index) => ({
    stage: routeStageMap[step.kind],
    name: `${step.kind}:${step.target}:${index}`,
    runId: asRunId(`run:${request.tenantId}:${index}`),
    transform: async ({ payload }) => payload,
  }));
};

export const executePipeline = async <
  TInput,
>(
  request: LatticeOrchestratorRequest<TInput>,
): Promise<StageResult<TInput, TInput>> => {
  const stages = adaptStages(request.blueprint, request);
  const engine = new LatticePipelineEngine<TInput, TInput>(
    {
      tenantId: request.tenantId,
      routeId: request.routeId,
      mode: request.mode,
      blueprint: request.blueprint,
      payload: request.payload,
      context: request.context,
    },
    stages,
  );
  const output = await engine.execute(request.payload);
  return {
    input: request.payload,
    output,
  };
};
