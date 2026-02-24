import { fail, ok, type Result } from '@shared/result';
import {
  type RuntimeContext,
  type RuntimeManifest,
  type RuntimePolicyMode,
  type RuntimeRunId,
  type RuntimeSessionId,
  type RuntimeTenantId,
  type RuntimeWorkspaceId,
  createRunId,
  createSessionId,
  createTenantId,
  createWorkspaceId,
  type RuntimeDiagnostics,
  type RuntimeEventPayload,
  type RuntimeRunResult,
  type RuntimeEventKind,
  type RuntimeStage,
  toDiagnostics,
  type RuntimePlugin,
  runtimeEventChannel,
} from './types.js';
import { RuntimeTelemetry } from './telemetry.js';
import { type RuntimePlan, buildRuntimePlan, summarizePlan } from './planner.js';
import { RuntimePluginRegistry } from './registry.js';

export interface OrchestratorInput<TInput = unknown> {
  readonly tenantId: string;
  readonly workspace: string;
  readonly session?: string;
  readonly plugins: readonly RuntimeManifest[];
  readonly mode: RuntimePolicyMode;
  readonly input: TInput;
}

export interface OrchestratorOutput<TOutput = unknown> {
  readonly runId: RuntimeRunId;
  readonly sessionId: RuntimeSessionId;
  readonly output: TOutput;
  readonly diagnostics: RuntimeDiagnostics;
  readonly summary: string;
  readonly plans: readonly RuntimePlan[];
}

export interface OrchestratorState {
  readonly status: 'idle' | 'running' | 'completed' | 'errored';
  readonly runId: RuntimeRunId | null;
  readonly lastError: string | null;
  readonly events: readonly RuntimeEventPayload[];
}

const timestamp = () => new Date().toISOString();

export class LabRuntimeOrchestrator<TInput = unknown, TOutput = unknown> implements AsyncDisposable {
  readonly #registry: RuntimePluginRegistry<readonly RuntimeManifest[]>;
  readonly #telemetry = new RuntimeTelemetry();
  #state: OrchestratorState = {
    status: 'idle',
    runId: null,
    lastError: null,
    events: [],
  };
  #disposed = false;

  public constructor(private readonly manifests: readonly RuntimeManifest[], private readonly mode: RuntimePolicyMode) {
    this.#registry = new RuntimePluginRegistry(manifests);
  }

  public get state(): OrchestratorState {
    return this.#state;
  }

  public listChannels(): readonly string[] {
    return this.#telemetry.summarize().map((entry) => entry.split(':')[0]);
  }

  public async run(input: TInput): Promise<Result<OrchestratorOutput<TOutput>, Error>> {
    if (this.#disposed) {
      return fail(new Error('orchestrator disposed'));
    }

    await using scope = new AsyncDisposableStack();
    scope.adopt(this.#telemetry, (telemetry) => {
      void telemetry[Symbol.asyncDispose]();
    });

    const tenantValue = typeof input === 'object' && input !== null && 'tenantId' in input && typeof (input as { tenantId?: unknown }).tenantId === 'string'
      ? (input as { tenantId: string }).tenantId
      : 'tenant-default';
    const tenantId = createTenantId(tenantValue);
    const workspace = 'workspace-default';
    const plan = buildRuntimePlan(this.manifests, {
      tenantId: tenantValue,
      workspace,
    });

    const runId = plan.runId;
    const sessionId = createSessionId(String(tenantValue), String(workspace));

    this.#state = {
      status: 'running',
      runId,
      lastError: null,
      events: [],
    };

    const context: Omit<RuntimeContext, 'scope' | 'stage'> & {
      tenantId: RuntimeTenantId;
      workspaceId: RuntimeWorkspaceId;
      sessionId: RuntimeSessionId;
    } = {
      runId,
      sessionId,
      tenantId,
      workspaceId: createWorkspaceId(tenantValue, workspace),
      startedAt: timestamp(),
      mode: this.mode,
      metadata: {
        plan: summarizePlan(plan),
      },
    };

    const events: RuntimeEventPayload[] = [];
    const emit = async (event: {
      readonly kind: RuntimeEventKind;
      readonly channel: RuntimeEventPayload['channel'];
      readonly at?: string;
      readonly payload: Record<string, unknown>;
    }) => {
      const payload = {
        ...event.payload,
        startedAt: event.at ?? timestamp(),
        mode: this.mode,
      };
      const traced: RuntimeEventPayload = {
        at: event.at ?? timestamp(),
        channel: event.channel,
        payload,
      };
      events.push(traced);
      this.#telemetry.push(traced);
    };

    try {
      await emit({
        at: timestamp(),
        kind: 'runtime.started',
        channel: runtimeEventChannel('topology', String(runId)),
        payload: { runId, status: 'starting' },
      });

      const ordered = this.#registry.resolveOrder();
      const orderedPlugins = ordered.map((entry) => entry.plugin);
      const result = await this.#registry.runSequence<TInput, TOutput>(input, {
        ...context,
        mode: this.mode,
        scope: 'topology',
        stage: 'collect',
      } as Omit<RuntimeContext, 'scope' | 'stage'> & {
        tenantId: RuntimeTenantId;
        workspaceId: RuntimeWorkspaceId;
        sessionId: RuntimeSessionId;
      }, async (event) => {
        await emit({
          at: event.at,
          kind: event.kind,
          channel: event.channel,
          payload: {
            pluginId: event.pluginId,
            scope: event.scope,
            mode: this.mode,
            state: context.metadata,
          },
        });
      });

      const diagnostics = toDiagnostics({
        runId,
        pluginCount: orderedPlugins.length,
        durationMs: plan.totalDurationMs,
        stageCount: plan.plans.length,
        channelCount: this.#telemetry.summarize().length,
      });

      await emit({
        at: timestamp(),
        kind: 'runtime.finished',
        channel: runtimeEventChannel('synthesis', String(runId)),
        payload: {
          runId,
          sessionId,
          pluginCount: orderedPlugins.length,
        },
      });

      const output: OrchestratorOutput<TOutput> = {
        runId,
        sessionId,
        output: result,
        diagnostics,
        summary: summarizePlan(plan),
        plans: [plan],
      };

      this.#state = {
        status: 'completed',
        runId,
        lastError: null,
        events: [...events],
      };

      return ok(output);
    } catch (error) {
      const stage = 'collect' as RuntimeStage;
      await emit({
        at: timestamp(),
        kind: 'runtime.failed',
        channel: runtimeEventChannel('topology', String(runId)),
        payload: {
          runId,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      this.#state = {
        status: 'errored',
        runId,
        lastError: error instanceof Error ? error.message : String(error),
        events: [...events],
      };
      return fail(error instanceof Error ? error : new Error('runtime failed'));
    }
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    await this.#telemetry[Symbol.asyncDispose]();
    await this.#registry[Symbol.asyncDispose]();
  }
}

export const runLabRuntime = async <TInput, TOutput>(
  input: OrchestratorInput<TInput>,
): Promise<Result<RuntimeRunResult<TOutput>, Error>> => {
  const orchestrator = new LabRuntimeOrchestrator<TInput, TOutput>(input.plugins, input.mode);
  const result = await orchestrator.run(input.input);

  if (!result.ok) {
    return fail(result.error);
  }

  return ok({
    runId: result.value.runId,
    workspaceId: createWorkspaceId(input.tenantId, input.workspace),
    sessionId: createSessionId(input.tenantId, input.workspace),
    output: result.value.output,
    stage: 'collect',
    diagnostics: result.value.diagnostics,
    manifests: input.plugins,
  });
};
