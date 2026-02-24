import type { PluginExecutionInput, PluginExecutionOutput, PluginTrace } from './plugin-registry';
import type { RunToken, PlanToken, TenantId } from './ids';

export interface RunEnvelope {
  readonly tenant: TenantId;
  readonly planId: PlanToken;
  readonly runId: RunToken;
  readonly startedAt: Date;
  readonly stageCount: number;
}

export interface RunEvent {
  readonly trace: {
    plugin: string;
    stage: PluginTrace['stage'];
    ms: number;
    ok: boolean;
  };
  readonly envelope: RunEnvelope;
}

export interface RunTelemetrySink {
  handle(event: RunEvent): Promise<void> | void;
}

export class DisposableRunScope implements AsyncDisposable {
  public readonly startedAt = new Date();

  public constructor(
    private readonly runId: RunToken,
    private readonly stageCount: number,
  ) {}

  public async [Symbol.asyncDispose](): Promise<void> {
    // no-op marker, intentionally minimal
    void this.runId;
    void this.stageCount;
  }
}

export const KERNEL_BOOTSTRAP_ID = `kernel:${Date.now()}`;

export const createDisposableScope = (): AsyncDisposableStack => new AsyncDisposableStack();

export const runPluginWithScope = async <TInput, TOutput>(
  envelope: RunEnvelope,
  plugin: (input: PluginExecutionInput<TInput>) => Promise<PluginExecutionOutput<TOutput>>,
  input: PluginExecutionInput<TInput>,
  telemetry: RunTelemetrySink,
): Promise<PluginExecutionOutput<TOutput>> => {
  await using _scope = new DisposableRunScope(envelope.runId, 1);

  const started = performance.now();
  const output = await plugin(input);
  const ms = Math.max(0, performance.now() - started);

  await telemetry.handle({
    trace: {
      plugin: output.plugin,
      stage: output.stage,
      ms,
      ok: true,
    },
    envelope,
  });

  return {
    ...output,
    durationMs: ms,
    payload: output.payload,
  };
};
