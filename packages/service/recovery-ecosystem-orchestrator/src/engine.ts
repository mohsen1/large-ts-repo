import {
  asRunId,
  asTenantId,
  buildRunTopology,
  type EcosystemPlan,
  type EcosystemMetric,
  type RecoveryRun,
  type StageConfig,
  type StageSnapshot,
  type StageStateBase,
  parseSummary,
  parseRunPayload,
  asHealthScore,
  classifyWarnings,
  type EventEnvelope,
  type LifecyclePhase,
  withDefaultPlan,
} from '@domain/recovery-ecosystem-core';
import type {
  EcosystemStorePort,
  StoreStats,
} from '@data/recovery-ecosystem-store';
import { fail, ok, type Result } from '@shared/result';
import type { JsonValue } from '@shared/type-level';

class RunScope implements AsyncDisposable {
  readonly #runId: ReturnType<typeof asRunId>;
  readonly #startedAt = performance.now();
  #closed = false;

  public constructor(runId: ReturnType<typeof asRunId>) {
    this.#runId = runId;
  }

  public durationMs(): number {
    return Math.round(performance.now() - this.#startedAt);
  }

  public close(): void {
    this.#closed = true;
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.close();
    return Promise.resolve();
  }
}

interface ExecutionContext {
  readonly runId: ReturnType<typeof asRunId>;
  readonly tenant: ReturnType<typeof asTenantId>;
  readonly namespace: `namespace:${string}`;
  readonly plan: EcosystemPlan;
}

const stagePhase = (index: number, total: number): LifecyclePhase =>
  index === 0 ? 'preflight' : index + 1 === total ? 'completed' : 'running';

export class EcosystemEngine {
  readonly #store: EcosystemStorePort;

  public constructor(store: EcosystemStorePort) {
    this.#store = store;
  }

  public async startRun(tenantId: string, namespace: string): Promise<Result<RecoveryRun>> {
    const context: ExecutionContext = {
      runId: asRunId(`run:${Date.now()}`),
      tenant: asTenantId(tenantId),
      namespace: `namespace:${namespace}` as `namespace:${string}`,
      plan: withDefaultPlan(asTenantId(tenantId), `namespace:${namespace}`),
    };

    const run: RecoveryRun = {
      id: context.runId,
      tenant: context.tenant,
      namespace: context.namespace,
      plan: context.plan,
      phase: 'queued',
      policyMode: 'mandatory',
      snapshots: [],
      records: [],
      warnings: classifyWarnings(['booting', 'preflight']),
    };

    await this.#store.save({
      runId: context.runId,
      tenant: context.tenant,
      namespace: context.namespace,
      payload: {
        run,
        startedAt: new Date().toISOString(),
      } as unknown as JsonValue,
      generatedAt: new Date().toISOString(),
    });

    await this.#store.append({
      namespace: context.namespace,
      runId: context.runId,
      tenant: context.tenant,
      event: 'event:run-started',
      at: new Date().toISOString(),
      payload: {
        startedAt: new Date().toISOString(),
        policyMode: run.policyMode,
      },
    });

    return ok(run);
  }

  public async executeRun(run: RecoveryRun): Promise<Result<RunSummary>> {
    if (run.plan.phases.length > 1000) {
      return fail(new Error('run-too-large'), 'guardrail');
    }

    await using scope = new RunScope(run.id);

    const route = buildRunTopology(run.namespace, run.plan.phases, {
      runId: run.id,
      tenant: run.tenant,
      events: 0,
      snapshotCount: 0,
    });

    const snapshots: StageStateBase[] = [];
    const timeline: EventEnvelope<{ index: number; tag: string }>[] = [];
    for (const [index, stage] of run.plan.phases.entries()) {
      const phase = stagePhase(index, run.plan.phases.length);
      const snapshot = await this.#executeStage({
        stage,
        index,
        total: run.plan.phases.length,
        context: run,
      });
      snapshots.push(snapshot);

      timeline.push({
        kind: 'event:stage',
        namespace: run.namespace,
        at: snapshot.startedAt,
        payload: {
          index,
          tag: stage.tags.at(0) ?? 'none',
        },
      });

      await this.#store.append({
        namespace: run.namespace,
        runId: run.id,
        tenant: run.tenant,
        stageId: stage.id,
        event: `event:${phase}` as `event:${string}`,
        at: new Date().toISOString(),
        payload: {
          index,
          stage: stage.name,
          phase,
        },
      });
    }

    const stages = snapshots.map((snapshot) => snapshot as StageSnapshot);
    const warningSummary = classifyWarnings(snapshots.flatMap((snapshot) => snapshot.metrics.map((metric) => String(metric.name))));
    const summary = parseSummary({
      runId: run.id,
      tenant: run.tenant,
      namespace: run.namespace,
      status: phaseFromTimeline(timeline),
      score: asHealthScore(86),
      startedAt: snapshots.at(0)?.startedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      stages,
    });

    await this.#store.save({
      runId: run.id,
      tenant: run.tenant,
      namespace: run.namespace,
      payload: {
        summary,
        warningSummary,
        run,
        timingMs: scope.durationMs(),
      } as unknown as JsonValue,
      generatedAt: new Date().toISOString(),
    });

    return ok(summary);
  }

  async #executeStage(
    input: {
      readonly stage: StageConfig;
      readonly index: number;
      readonly total: number;
      readonly context: RecoveryRun;
    },
  ): Promise<StageStateBase> {
    const startedAt = new Date().toISOString();
    await this.#store.append({
      namespace: input.context.namespace,
      runId: input.context.id,
      tenant: input.context.tenant,
      stageId: input.stage.id,
      event: 'event:stage-enter',
      at: startedAt,
      payload: {
        plugin: input.stage.plugin,
        index: input.index,
      },
    });

    const status = stagePhase(input.index, input.total);
    const snapshot: StageStateBase = {
      id: input.stage.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status,
      metrics: input.stage.tags.map((tag) => ({
        name: `metric:${tag}` as EcosystemMetric['name'],
        value: input.index + input.stage.retries,
        unit: 'points',
        labels: {
          stage: input.stage.id,
          tenant: input.context.tenant,
        },
      })),
      payload: parseRunPayload({
        stage: input.stage,
        index: input.index,
        status,
      }),
    };
    return snapshot;
  }

  public async stats(): Promise<StoreStats> {
    return this.#store.stats();
  }
}

const phaseFromTimeline = (timeline: readonly { readonly payload: { readonly index: number } }[]): LifecyclePhase => {
  const last = timeline.at(-1);
  if (!last) {
    return 'queued';
  }
  return last.payload.index % 2 === 0 ? 'running' : 'completed';
};

export type RunSummary = Awaited<ReturnType<typeof parseSummary>>;
