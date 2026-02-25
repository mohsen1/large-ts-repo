import { fail, ok, type Result } from '@shared/result';
import { performance } from 'node:perf_hooks';
import { withBrand } from '@shared/core';
import { type JsonValue } from '@shared/type-level';
import {
  buildDiagnostics,
  createEvent,
  createMetric,
  PlaybookStudioPluginRegistry,
  summarize,
  type PluginDefinitionBag,
  type PluginOutput,
  type StudioEvent,
  type StudioMetric,
  type StudioPluginContext,
  type StudioSnapshot,
} from '@shared/playbook-studio-runtime';
import type {
  StageKind,
  PlaybookRun,
  PlaybookRunSummary,
  PlaybookTemplateBase,
} from './models';
import { defaultTemplate, defaultTemplateIntent as bootstrapTemplateIntent } from './fixtures';

type PluginDefinitions = PluginDefinitionBag;
type PluginOutputMap<T extends PluginDefinitions> = {
  [K in keyof T]: PluginOutput<T[K]>;
};

const identityJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export interface StudioRunRequest {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly requestedBy: string;
  readonly templateId: string;
  readonly strategy: PlaybookTemplateBase['strategy'];
}

export interface StudioRunProfile {
  readonly stage: StageKind;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly detail: `${StageKind}-phase`;
}

export interface StudioRunResult {
  readonly run: PlaybookRun;
  readonly snapshot: StudioSnapshot;
  readonly metrics: Record<string, number>;
  readonly events: readonly StudioEvent[];
  readonly diagnostics: ReturnType<typeof buildDiagnostics>;
  readonly pluginDigest: PluginOutputMap<PluginDefinitions>;
}

export interface StudioOrchestratorSeed {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestId: string;
}

type RunProfileSeed = {
  readonly request: StudioRunRequest;
  readonly inputFingerprint: string;
  readonly startedAt: string;
};

type RunProfileOutput = RunProfileSeed & {
  readonly stages: readonly StageKind[];
  readonly profiles: readonly StudioRunProfile[];
};

export class StudioOrchestrator<TDefinitions extends PluginDefinitions> {
  readonly #registry: PlaybookStudioPluginRegistry<TDefinitions>;
  readonly #stack = new AsyncDisposableStack();
  readonly #stageSpecs: readonly StageKind[];

  constructor(
    private readonly seed: StudioOrchestratorSeed,
    plugins: TDefinitions,
    stageSpecs: readonly StageKind[] = ['plan', 'validate', 'execute', 'observe', 'review'],
  ) {
    this.#registry = new PlaybookStudioPluginRegistry(plugins);
    this.#stageSpecs = stageSpecs;
  }

  private createContext(request: StudioRunRequest): StudioPluginContext {
    return {
      tenantId: withBrand(request.tenantId, 'TenantId'),
      workspaceId: withBrand(request.workspaceId, 'WorkspaceId'),
      requestId: withBrand(request.templateId, 'TraceId'),
    };
  }

  private async bootstrapPlugins(
    context: StudioPluginContext,
    request: StudioRunRequest,
  ): Promise<Result<PluginOutputMap<TDefinitions>, string>> {
    try {
      const output = await this.#registry.bootstrapAll(context, {
        tenantId: request.tenantId,
        workspaceId: request.workspaceId,
        requestId: request.templateId,
      } as never);
      return ok(output as PluginOutputMap<TDefinitions>);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'plugin-bootstrap-failed');
    }
  }

  private createProfilePipeline(seed: RunProfileSeed): RunProfileOutput {
    const profiles = this.#stageSpecs.map((stage, index): StudioRunProfile => ({
      stage,
      durationMs: (index + 1) * 13 + this.#stageSpecs.length,
      ok: true,
      detail: `${stage}-phase`,
    }));
    return { ...seed, stages: this.#stageSpecs, profiles };
  }

  async run(
    input: unknown,
    request: StudioRunRequest,
  ): Promise<Result<StudioRunResult, string>> {
    await using _stack = this.#stack;

    const now = Date.now();
    const started = new Date(now).toISOString();
    const context = this.createContext(request);

    const bootstrap = await this.bootstrapPlugins(context, request);
    if (!bootstrap.ok) return fail(bootstrap.error);

    const profileOutput = this.createProfilePipeline({
      request,
      inputFingerprint: identityJson(input),
      startedAt: started,
    });

    const stages: readonly StageKind[] = [...profileOutput.stages];
    const profiles = profileOutput.profiles;
    const runIdValue = `run:${this.seed.tenantId}:${this.seed.workspaceId}:${request.templateId}:${now}`;
    const traceIdValue = `trace:${request.templateId}:${now}`;

    const run: PlaybookRun = {
      runId: withBrand(runIdValue, 'RunId'),
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      artifactId: withBrand(request.artifactId, 'ArtifactId'),
      traceId: withBrand(traceIdValue, 'TraceId'),
      requestedBy: request.requestedBy,
      startedAt: started,
      status: 'running',
      stages,
      steps: stages.map((stage, index) => ({
        stepId: stage,
        state: index < stages.length ? 'running' : 'pending',
        startedAt: new Date(now + index * 20).toISOString(),
        completedAt: new Date(now + (index + 1) * 20).toISOString(),
        message: `stage ${stage} profile`,
      })),
    };

    const events: StudioEvent[] = [
      createEvent(run.runId, run.traceId, 'stage-start', {
        request: request.templateId,
        artifact: request.artifactId,
        mode: request.strategy,
      }),
      createEvent(run.runId, run.traceId, 'stage-finish', {
        stages: stages.length,
        profileCount: profiles.length,
      }),
    ];

    const metrics: readonly StudioMetric[] = [
      ...profiles.flatMap((profile) => [createMetric(run.runId, run.traceId, `metric:${profile.stage}`, profile.durationMs)]),
      createMetric(run.runId, run.traceId, 'metric:stages', stages.length),
      createMetric(run.runId, run.traceId, 'metric:input-size', profileOutput.inputFingerprint.length),
      createMetric(run.runId, run.traceId, 'metric:duration', performance.now() - now),
    ];
    const snapshot: StudioSnapshot = {
      runId: run.runId,
      metrics,
      events,
    };

    const diagnostics = buildDiagnostics([run.artifactId], [
      {
        code: 'RUN:01',
        title: `complete:${request.strategy}`,
        message: `Completed run ${run.runId} with ${profiles.length} stages`,
        runId: run.runId,
        artifactId: run.artifactId,
        payload: createDiagnosticPayload({
          input: profileOutput.inputFingerprint,
          strategy: request.strategy,
          tenant: request.tenantId,
          workspace: request.workspaceId,
          stages: stages as unknown as JsonValue,
          profiles: profiles.length,
        }),
        metadata: {
          severity: 'info',
          at: performance.now(),
        },
      },
    ]);

    return ok({
      run,
      snapshot,
      metrics: summarize(snapshot),
      events,
      diagnostics,
      pluginDigest: bootstrap.value,
    });
  }

  pluginOrder(): readonly string[] {
    return this.#registry.bootOrder().map((entry) => `plugin:${entry}`);
  }

  async describe(): Promise<PlaybookRunSummary> {
    const template = bootstrapTemplateIntent.ok ? bootstrapTemplateIntent.value : undefined;
    const runSeed = template?.runId ?? `${this.seed.tenantId}-${this.seed.workspaceId}`;
    const templateId = template?.runId ? `template:${template.runId}` : `${this.seed.tenantId}/${this.seed.workspaceId}/bootstrap`;
    const requestedBy = template?.requestedBy ?? 'system';
    const strategy = defaultTemplate.strategy;

    const base: PlaybookRunSummary = {
      tenantId: this.seed.tenantId,
      workspaceId: this.seed.workspaceId,
      artifactId: String(defaultTemplate.artifactId),
      requestedBy,
      templateId,
      strategy,
      confidence: strategy === 'predictive' ? 0.92 : strategy === 'reactive' ? 0.81 : 0.79,
      started: new Date().toISOString(),
      runId: withBrand(runSeed, 'RunId'),
      passed: true,
    };

    return base;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#registry[Symbol.asyncDispose]();
    await this.#stack.disposeAsync();
  }
}

const createDiagnosticPayload = (value: Readonly<Record<string, JsonValue>>): Readonly<Record<string, JsonValue>> => value;

export const createStudioSummary = (
  seed: StudioOrchestratorSeed,
): { readonly seed: StudioOrchestratorSeed; readonly stages: readonly StageKind[] } => ({
  seed,
  stages: ['plan', 'validate', 'execute'],
});
