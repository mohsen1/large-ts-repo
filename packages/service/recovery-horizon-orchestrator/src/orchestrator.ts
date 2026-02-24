import { err, ok, type Result } from '@shared/result';
import {
  buildRegistry,
  executePipeline,
  type JsonLike,
  type HorizonSignal,
  type HorizonPlan,
  type PlanId,
  type PluginConfig,
  type PluginStage,
  makePipelineContext,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import {
  createSignalAdapter as makeAdapter,
} from './adapterFactory';
import type { HorizonLookupConfig, RecoveryHorizonRepository, HorizonMutationEvent, HorizonReadResult } from '@data/recovery-horizon-store';
import type {
  HorizonOrchestratorConfig,
  HorizonServiceSnapshot,
  HorizonRunContext,
  HorizonOrchestratorResult,
  HorizonQuery,
  RuntimeState,
  HorizonServiceStats,
  StageReport,
  StageResult,
  HorizonRunnerContract,
} from './types.js';

type AsyncStack = {
  use<T>(value: T): T;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

class StageWindow {
  #cursor = 0;

  constructor(private readonly stages: readonly PluginStage[]) {}

  next() {
    if (this.#cursor >= this.stages.length) {
      return undefined;
    }
    return this.stages[this.#cursor++];
  }

  reset() {
    this.#cursor = 0;
  }
}

class LogScope {
  private _closed = false;

  [Symbol.dispose]() {
    this._closed = true;
  }
}

class AsyncRunScope {
  #context: HorizonRunContext;
  private _closed = false;

  constructor(context: HorizonRunContext) {
    this.#context = context;
  }

  [Symbol.asyncDispose]() {
    this._closed = true;
    return Promise.resolve();
  }

  static create(runId: string, tenantId: string, stageWindow: readonly PluginStage[]) {
    return new AsyncRunScope({
      runId: horizonBrand.fromRunId(runId),
      startedAt: horizonBrand.fromTime(Date.now()),
      state: 'running',
      stageWindow,
    });
  }

  get context() {
    return this.#context;
  }
}

export class HorizonOrchestrator {
  #state: RuntimeState = 'idle';

  constructor(
    private readonly repository: RecoveryHorizonRepository,
    private readonly config: HorizonOrchestratorConfig,
  ) {
    buildRegistry(config.stageWindow);
  }

  async run(plan: HorizonPlan): Promise<HorizonOrchestratorResult> {
    const context = makePipelineContext(plan.tenantId, plan.id, Date.now());
    const stackCtor = (
      globalThis as unknown as { AsyncDisposableStack?: new () => AsyncStack }
    ).AsyncDisposableStack;

    if (!stackCtor) {
      this.#state = 'failed';
      throw new Error('AsyncDisposableStack unavailable');
    }

    const stack = new stackCtor();
    using _ = new LogScope();
    const runScope = stack.use(AsyncRunScope.create(
      `run-${context.planId}-${context.startedAt}`,
      context.tenantId,
      this.config.stageWindow,
    ));

    const start = Date.now();
    const reports: StageResult[] = [];
    const stageWindow = new StageWindow(this.config.stageWindow);

    let currentStage = stageWindow.next();
    while (currentStage) {
      const marker = Date.now();
      const adapter = makeAdapter(currentStage, this.config.owner);
      const input: PluginConfig<PluginStage, JsonLike> = {
        pluginKind: currentStage,
        payload: {
          pluginKind: currentStage,
          payload: {
            plugin: currentStage,
            tenantId: this.config.tenantId,
          },
          retryWindowMs: horizonBrand.fromTime(1000),
        },
        retryWindowMs: horizonBrand.fromTime(1000),
      };
      const outputs = await executePipeline(adapter, [input], [currentStage]);

      const syntheticSignal: HorizonSignal<PluginStage, JsonLike> = {
        id: horizonBrand.fromPlanId(`signal-${currentStage}-${marker}`),
        kind: currentStage,
        payload: {
          pluginKind: currentStage,
          payload: {
            stage: currentStage,
            marker,
          },
          retryWindowMs: horizonBrand.fromTime(1000),
        },
        input: {
          version: '1.0.0',
          runId: runScope.context.runId,
          tenantId: this.config.tenantId,
          stage: currentStage,
          tags: this.config.tags,
          metadata: {
            window: this.config.stageWindow.join('|'),
            startedAt: context.startedAt,
          },
        },
        severity: 'low',
        startedAt: horizonBrand.fromDate(new Date(marker).toISOString()),
      };

      await this.repository.write(outputs[0] ?? syntheticSignal);
      const elapsed = Date.now() - marker;

      reports.push({
        stage: currentStage,
        startedAt: horizonBrand.fromTime(marker),
        elapsedMs: horizonBrand.fromTime(elapsed),
        ok: outputs.length > 0,
        errors: outputs.length ? [] : [`No events for ${currentStage}`],
      });

      currentStage = stageWindow.next();
    }

    stageWindow.reset();
    this.#state = 'completed';
    await runScope[Symbol.asyncDispose]();

    return {
      ok: reports.every((entry) => entry.ok),
      runId: runScope.context.runId,
      elapsedMs: horizonBrand.fromTime(Date.now() - start),
      stages: reports,
    };
  }

  async query(input: HorizonQuery): Promise<HorizonReadResult> {
    const config: HorizonLookupConfig = {
      tenantId: input.tenantId,
      stages: this.config.stageWindow,
      includeArchived: input.includeArchived ?? false,
      maxRows: input.maxRows,
    } satisfies HorizonLookupConfig;

    const result = await this.repository.read(config);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }

  async snapshot(input: HorizonLookupConfig): Promise<HorizonServiceSnapshot> {
    const result = await this.repository.read(input);
    if (!result.ok) {
      throw result.error;
    }
    const plans = result.value.items.reduce<HorizonPlan[]>((acc, item) => {
      if (item.plan) {
        acc.push(item.plan);
      }
      return acc;
    }, []);

    return {
      tenantId: input.tenantId,
      state: {
        runId: horizonBrand.fromRunId(`run-${input.tenantId}`),
        startedAt: horizonBrand.fromTime(Date.now()),
        state: this.#state,
        stageWindow: this.config.stageWindow,
      },
      latest: {
        plans,
        signals: result.value.items.map((entry) => entry.signal),
      },
    };
  }

  async drain(planId: PlanId): Promise<Result<true>> {
    const drainSignal: HorizonSignal<PluginStage, JsonLike> = {
      id: horizonBrand.fromPlanId(`drain-${planId}`),
      kind: this.config.stageWindow[0] ?? 'ingest',
      payload: { planId },
      input: {
        version: '1.0.0',
        runId: horizonBrand.fromRunId(`drain-${planId}`),
        tenantId: this.config.tenantId,
        stage: this.config.stageWindow[0] ?? 'ingest',
        tags: ['drain'],
        metadata: {
          drained: true,
        },
      },
      severity: 'low',
      startedAt: horizonBrand.fromDate(new Date().toISOString()),
    };

    const result = await this.repository.write(drainSignal);
    if (!result.ok) {
      return err(result.error);
    }

    this.#state = 'completed';
    return ok(true);
  }

  async replayEvents(input: HorizonLookupConfig): Promise<readonly HorizonMutationEvent[]> {
    const result = await this.repository.history(input);
    if (!result.ok) {
      throw result.error;
    }
    return result.value.events;
  }

  async report(input: HorizonLookupConfig): Promise<StageReport> {
    const read = await this.query({ tenantId: input.tenantId, includeArchived: input.includeArchived ?? false, maxRows: input.maxRows });
    const stageCounts = read.items.reduce<Record<PluginStage, number>>((acc, item) => {
      acc[item.signal.kind] = (acc[item.signal.kind] ?? 0) + 1;
      return acc;
    }, {
      ingest: 0,
      analyze: 0,
      resolve: 0,
      optimize: 0,
      execute: 0,
    });

    const elapsed = read.items.reduce((total, item) => total + Number(item.updatedAt), 0);
    const stages = this.config.stageWindow.map((stage, order) => ({
      stage,
      startedAt: horizonBrand.fromTime(Date.now()),
      elapsedMs: horizonBrand.fromTime(order * 100),
      ok: (stageCounts[stage] ?? 0) > 0,
      errors: stageCounts[stage] ? [] : ['missing stage'],
    }));

    return {
      runId: horizonBrand.fromRunId(`report-${input.tenantId}`),
      planName: this.config.planName,
      elapsedMs: horizonBrand.fromTime(elapsed),
      stages,
    };
  }

  async stats(input: HorizonLookupConfig): Promise<HorizonServiceStats> {
    const response = await this.query({
      tenantId: input.tenantId,
      includeArchived: input.includeArchived ?? false,
      maxRows: input.maxRows,
    });

    const stageMix: { [K in PluginStage]?: number } = {
      ingest: 0,
      analyze: 0,
      resolve: 0,
      optimize: 0,
      execute: 0,
    };

    for (const item of response.items) {
      stageMix[item.signal.kind] = (stageMix[item.signal.kind] ?? 0) + 1;
    }

    return {
      totalPlans: response.total,
      stageMix,
      mutationCount: response.total,
    };
  }
}

export const runHorizonPlan = async (
  repository: RecoveryHorizonRepository,
  config: HorizonOrchestratorConfig,
  plan: HorizonPlan,
): Promise<Result<HorizonOrchestratorResult>> => {
  const orchestrator = new HorizonOrchestrator(repository, config);
  try {
    const result = await orchestrator.run(plan);
    return ok(result);
  } catch (error) {
    return err(error as Error);
  }
};
