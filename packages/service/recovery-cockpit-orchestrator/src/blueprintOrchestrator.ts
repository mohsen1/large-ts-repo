import { Result, fail, ok } from '@shared/result';
import { RecoveryPlan, EntityRef, nextEntityId } from '@domain/recovery-cockpit-models';
import { RecoveryBlueprint, buildBlueprintFromPlan, summarizeBlueprint, stableBlueprintId, withBlueprint } from '@domain/recovery-cockpit-models';
import {
  InMemoryBlueprintCatalog,
  type BlueprintCatalogQuery,
  type BlueprintCatalogSnapshot,
  BlueprintAdapterHub,
  type AdapterContext,
  type BlueprintAdapterMode,
  ExecutionAdapter,
  LoggingAdapter,
  SimulationAdapter,
  VerifyAdapter,
} from '@data/recovery-cockpit-store';
import { AsyncScopeFence } from '@shared/typed-orchestration-core';

const runtimeDefaults = {
  maxAttempts: 2,
};

export type BlueprintOrchestratorConfig = {
  readonly concurrency: number;
  readonly maxAttempts: number;
  readonly namespace: string;
};

export type BlueprintExecutionSummary = {
  readonly planId: RecoveryPlan['planId'];
  readonly blueprintId: RecoveryBlueprint['blueprintId'];
  readonly digest: string;
  readonly artifactCount: number;
  readonly completed: boolean;
};

type RunningContext = {
  readonly runId: string;
  readonly mode: BlueprintAdapterMode;
  readonly attempt: number;
};

type BlueprintRunResult = {
  readonly blueprint: RecoveryBlueprint;
  readonly startedAt: string;
  readonly context: RunningContext;
  readonly summary: BlueprintExecutionSummary;
  readonly snapshots: BlueprintCatalogSnapshot;
  readonly modeResults: number;
};

const normalizeNamespace = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

export class RecoveryBlueprintOrchestrator {
  #catalog: InMemoryBlueprintCatalog;
  #adapters: BlueprintAdapterHub;
  #runId = 0;

  public constructor(private readonly config: Partial<BlueprintOrchestratorConfig> = {}) {
    this.#catalog = new InMemoryBlueprintCatalog(
      config.namespace
        ? [{ planId: `seed:${config.namespace}` as RecoveryPlan['planId'], namespace: config.namespace, risk: 30 }]
        : [],
    );
    this.#adapters = new BlueprintAdapterHub([
      new LoggingAdapter(),
      new SimulationAdapter(),
      new ExecutionAdapter(this.#catalog),
      new VerifyAdapter(),
    ]);
  }

  public async upsertBlueprint(plan: RecoveryPlan): Promise<Result<RecoveryBlueprint, string>> {
    const namespace = normalizeNamespace(this.config.namespace ?? 'ops');
    const blueprint = buildBlueprintFromPlan(plan, namespace);
    return this.#catalog.upsert(blueprint);
  }

  public async listBlueprints(query: BlueprintCatalogQuery = {}): Promise<Result<readonly RecoveryBlueprint[], string>> {
    return this.#catalog.find(query);
  }

  public snapshot(): BlueprintCatalogSnapshot {
    return this.#catalog.snapshot();
  }

  public async execute(plan: RecoveryPlan, mode: BlueprintAdapterMode = 'analysis'): Promise<Result<BlueprintRunResult, string>> {
    const run: RunningContext = {
      runId: `run:${this.#runId += 1}:${Date.now()}`,
      mode,
      attempt: 0,
    };

    const catalog = await this.upsertBlueprint(plan);
    if (!catalog.ok) {
      return fail(catalog.error);
    }

    const blueprint = withBlueprint(catalog.value, (draft) => draft);
    const context = this.buildAdapterContext(run, mode);
    const adapterResult = await this.runAdapters(blueprint, context);
    if (!adapterResult.ok) {
      return fail(adapterResult.error);
    }

    const summary: BlueprintExecutionSummary = {
      planId: plan.planId,
      blueprintId: blueprint.blueprintId,
      digest: `${blueprint.steps.length}:${blueprint.status}:${blueprint.riskScore}`,
      artifactCount: this.#catalog.findArtifacts(blueprint.blueprintId).length,
      completed: adapterResult.value.every((result) => result.status === 'success' || result.status === 'skipped'),
    };

    return ok({
      blueprint,
      startedAt: catalog.value.createdAt,
      context: run,
      summary,
      snapshots: this.#catalog.snapshot(),
      modeResults: adapterResult.value.length,
    });
  }

  public async preview(plan: RecoveryPlan): Promise<RecoveryBlueprint[]> {
    const source = buildBlueprintFromPlan(plan, normalizeNamespace(this.config.namespace ?? 'ops'));
    const normalized = [withBlueprint(source, (draft) => draft)];
    const result: RecoveryBlueprint[] = [];
    const actor = nextEntityId(`operator:${normalizeNamespace(this.config.namespace ?? 'ops')}`);
    for (const blueprint of normalized) {
      const digest = stableBlueprintId(blueprint, actor);
      if (digest.length > 0) {
        result.push(blueprint);
      }
    }
    return result;
  }

  private async runAdapters(
    blueprint: RecoveryBlueprint,
    context: AdapterContext,
  ): Promise<
    Result<ReadonlyArray<{ adapterId: string; status: 'success' | 'skipped' | 'error'; count: number; details: readonly string[]; finishedAt: string }>, string>
  > {
    const scope = new AsyncScopeFence(
      { namespace: 'namespace:recovery-blueprint-orchestrator', tags: ['run', context.runId] },
      () => {
        this.#runId = Math.max(0, this.#runId - 1);
      },
    );
    const attemptLimit = this.config.maxAttempts ?? runtimeDefaults.maxAttempts;
    const outcomes: {
      adapterId: string;
      status: 'success' | 'skipped' | 'error';
      count: number;
      details: readonly string[];
      finishedAt: string;
    }[] = [];

    try {
      for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
        const mode = attempt === 0 ? context.mode : 'simulate';
        const attemptedContext: AdapterContext = {
          ...context,
          correlation: { ...context.correlation, attempt },
        };
        const run = await this.#adapters.runMode(mode, blueprint, attemptedContext);
        if (!run.ok) {
          return fail(run.error);
        }
        outcomes.push(...run.value);
        if (run.value.every((entry) => entry.status === 'success')) {
          break;
        }
      }
      return ok(outcomes);
    } finally {
      await scope.close('adaptor-sweep');
    }
  }

  private buildAdapterContext(run: RunningContext, mode: BlueprintAdapterMode): AdapterContext {
    return {
      actor: {
        id: nextEntityId(`operator:${run.runId}`),
        kind: 'operator',
      },
      runId: run.runId,
      mode,
      correlation: {
        trace: `trace:${run.runId}`,
        attempt: run.attempt,
      },
    };
  }
}
