import { fail, ok, type Result } from '@shared/result';
import {
  makeReadinessLabNamespace,
  type ReadinessLabExecutionInput,
  type ReadinessLabExecutionOutput,
  type ReadinessLabRunId,
  type ReadinessLabStep,
  type ReadinessLabWorkspaceModel,
  type ReadinessLabNamespace,
  buildReadinessLabManifest,
} from '@domain/recovery-readiness';
import { ReadinessLabGraph, ReadinessLabPluginCatalog, type ReadinessLabPlugin } from '@domain/recovery-readiness';
import type { ReadinessLabWorkspaceStore } from '@data/recovery-readiness-store';
import { ReadinessLabAnalytics } from '@data/recovery-readiness-store';

interface LabSessionState {
  readonly workspaceId: ReadinessLabRunId;
  readonly tenant: string;
  readonly namespace: string;
  readonly createdAt: string;
  readonly runs: ReadonlyArray<ReadinessLabRunId>;
}

export interface ReadinessLabSessionResult {
  readonly workspaceId: ReadinessLabRunId;
  readonly manifest: ReturnType<typeof buildReadinessLabManifest>;
  readonly graphNodes: number;
  readonly runCount: number;
  readonly warnings: readonly string[];
}

export interface ReadinessLabRunnerOptions {
  tenant: string;
  namespace: string;
  workspaceId?: ReadinessLabRunId;
  repository: ReadinessLabWorkspaceStore;
}

export interface ReadinessLabExecutionPlan<TSteps extends readonly ReadinessLabStep[]> {
  readonly workspaceId: ReadinessLabRunId;
  readonly steps: TSteps;
  readonly runLimit: number;
}

export class ReadinessLabSession implements AsyncDisposable {
  readonly #state: LabSessionState;
  readonly #plugins: ReadinessLabPluginCatalog<readonly ReadinessLabPlugin[]>;
  readonly #store: ReadinessLabWorkspaceStore;
  readonly #analytics: ReadinessLabAnalytics;

  constructor(
    options: ReadinessLabRunnerOptions,
    plugins: ReadinessLabPluginCatalog<readonly ReadinessLabPlugin[]>,
  ) {
    this.#state = {
      workspaceId: options.workspaceId ?? `${options.tenant}:lab:${options.namespace}` as ReadinessLabRunId,
      tenant: options.tenant,
      namespace: options.namespace,
      createdAt: new Date().toISOString(),
      runs: [],
    };
    this.#plugins = plugins;
    this.#store = options.repository;
    this.#analytics = new ReadinessLabAnalytics(this.#store);
  }

  async bootstrapWorkspace(stages: ReadonlyArray<ReadinessLabStep>): Promise<Result<ReadinessLabSessionResult, Error>> {
    const manifest = buildReadinessLabManifest({
      tenant: this.#state.tenant,
      namespace: this.#state.namespace,
      runId: this.#state.workspaceId,
      steps: [...stages],
    });

    const graph = new ReadinessLabGraph(
      this.#state.workspaceId,
      stages,
      stages.map((step, index) => ({ step, index, score: index })),
    );
    const runCount = Math.max(1, [...graph.nodes].length);
    const workspace: ReadinessLabWorkspaceModel = {
      workspaceId: this.#state.workspaceId,
      tenant: this.#state.tenant,
      namespace: makeReadinessLabNamespace(this.#state.tenant, `${this.#state.namespace}:ns`),
      planId: `${this.#state.workspaceId}:plan` as ReadinessLabWorkspaceModel['planId'],
      channels: new Set(['telemetry', 'control', 'signal']),
      signalBuckets: [],
      stages,
    };

    const saved = await this.#store.upsert(workspace);
    if (!saved.ok) {
      return fail(new Error(saved.error.message));
    }

    return ok({
      workspaceId: workspace.workspaceId,
      manifest,
      graphNodes: graph.nodes.size,
      runCount,
      warnings: ['bootstrap-success'],
    });
  }

  async execute<TSteps extends readonly ReadinessLabStep[]>(
    plan: ReadinessLabExecutionPlan<TSteps>,
    draftRun: ReadinessLabExecutionInput,
  ): Promise<ReadonlyArray<ReadinessLabExecutionOutput>> {
    const namespace = makeReadinessLabNamespace(this.#state.tenant, `${this.#state.namespace}:ns`);
    const outputs = await this.#plugins.runSequential(
      {
        context: {
          tenant: this.#state.tenant,
          namespace,
          runId: draftRun.context.runId,
          policy: draftRun.context.policy,
          enabledChannels: draftRun.context.enabledChannels,
          runLimit: draftRun.context.runLimit,
        },
        plan: draftRun.plan,
        directives: draftRun.directives,
        targetSnapshot: draftRun.targetSnapshot,
      },
      plan.steps as readonly string[],
    );

    const last = outputs.at(-1);
    if (last) {
      await this.#store.upsert({
        workspaceId: this.#state.workspaceId,
        tenant: this.#state.tenant,
        namespace,
        planId: `${this.#state.workspaceId}:plan` as ReadinessLabWorkspaceModel['planId'],
        channels: new Set(['telemetry', 'signal']),
        signalBuckets: [],
        stages: [plan.steps[0] as ReadinessLabWorkspaceModel['stages'][number], ...(plan.steps.slice(1) as ReadonlyArray<ReadinessLabWorkspaceModel['stages'][number]>)],
      });
      await this.#store.appendExecution(this.#state.workspaceId, last);
    }

    await this.#analytics.executionAudits([this.#state.workspaceId]);
    return outputs;
  }

  async snapshot(): Promise<{ workspaceCount: number; averageSignalsPerRun: number }> {
    const metrics = await this.#store.metrics();
    return {
      workspaceCount: metrics.workspaceCount,
      averageSignalsPerRun: metrics.averageSignalsPerRun,
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#plugins[Symbol.asyncDispose]();
  }

  [Symbol.dispose](): void {
    this.#plugins[Symbol.dispose]();
  }
}

export const withReadinessLabSession = async <T>(
  options: ReadinessLabRunnerOptions,
  plugins: ReadinessLabPluginCatalog<readonly ReadinessLabPlugin[]>,
  callback: (session: ReadinessLabSession) => Promise<T>,
): Promise<T> => {
  const session = new ReadinessLabSession(options, plugins);
  const result = await callback(session);
  await session[Symbol.asyncDispose]();
  return result;
};
