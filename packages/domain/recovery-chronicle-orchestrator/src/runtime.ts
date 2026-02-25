import { asChronicleTenantId, asChronicleRoute } from '@domain/recovery-chronicle-core';
import { MemoryArtifactAdapter } from './adapter';
import {
  axisWeightDefaults,
  buildRunId,
  buildTrace,
  defaultPolicy,
  type OrchestrationMode,
  type OrchestrationPolicy,
  type OrchestrationRunContext,
  type OrchestrationRunId,
} from './types';

interface RuntimeProfile {
  readonly profileId: 'default' | 'burst' | 'low-cost';
  readonly maxQueue: number;
  readonly namespace: string;
}

const loadProfiles = async (): Promise<readonly RuntimeProfile[]> => {
  await new Promise((resolve) => setTimeout(resolve, 1));
  return [
    { profileId: 'default', maxQueue: 128, namespace: 'default' },
    { profileId: 'burst', maxQueue: 256, namespace: 'burst' },
    { profileId: 'low-cost', maxQueue: 48, namespace: 'low-cost' },
  ];
};

export const loadRuntimeProfiles = async (): Promise<readonly RuntimeProfile[]> => loadProfiles();

export interface RuntimeConfig {
  readonly namespace: ReturnType<typeof asChronicleRoute>;
  readonly allowParallel: boolean;
  readonly maxQueue: number;
  readonly includeTelemetry: boolean;
}

export class OrchestrationRuntimeSession implements AsyncDisposable {
  readonly #context: OrchestrationRunContext;
  readonly #adapter: MemoryArtifactAdapter<unknown>;
  readonly #abort: AbortController;
  #disposed = false;

  public constructor(runId: OrchestrationRunId, policy: OrchestrationPolicy, mode: OrchestrationMode) {
    const namespace = asChronicleRoute(`runtime/${policy.tenant}`);
    const maxQueue = mode === 'adaptive' ? 256 : mode === 'simulated' ? 48 : 128;

    this.#context = {
      runId,
      tenant: policy.tenant,
      policyId: policy.id,
      channels: ['signal', 'policy', 'telemetry', 'incident'],
      profile: {
        namespace,
        allowParallel: mode !== 'strict',
        maxQueue,
        includeTelemetry: true,
      },
      startedAt: Date.now(),
    };

    this.#abort = new AbortController();
    this.#adapter = new MemoryArtifactAdapter<unknown>(`runtime-${runId}`);
  }

  public get context(): OrchestrationRunContext {
    return this.#context;
  }

  public async open(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new DOMException('artifact adapter aborted', 'AbortError');
    }
    await this.#adapter.open(signal);
  }

  public async push(value: unknown): Promise<void> {
    await this.#adapter.emit(value);
  }

  public async close(): Promise<void> {
    await this.#adapter.close();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#abort.abort();
    await this.close();
  }
}

export const withRuntimeContext = async <TResult>(
  tenant: string,
  policy: OrchestrationPolicy | undefined,
  mode: OrchestrationMode,
  callback: (context: OrchestrationRunContext) => Promise<TResult>,
): Promise<TResult> => {
  const active = policy ?? defaultPolicy(tenant);
  const route = asChronicleRoute('runtime-session');
  const runId = buildRunId(asChronicleTenantId(tenant), route);
  const trace = buildTrace(runId, ['bootstrap', 'policy', 'telemetry', 'finalize']);
  const start = Date.now();
  const profiles = await loadRuntimeProfiles();
  const defaultProfile = profiles.find((entry) => entry.profileId === 'default') ?? profiles[0];

  const abort = new AbortController();
  await using stack = new AsyncDisposableStack();
  await using session = new OrchestrationRuntimeSession(runId, active, mode);

  stack.defer(() => {
    abort.abort();
  });

  stack.defer(async () => {
    await session.push({
      type: 'runtime-close',
      namespace: axisWeightDefaults,
      at: Date.now(),
      elapsedMs: Date.now() - start,
      profileNamespace: defaultProfile.namespace,
      trace,
    });
  });

  await session.open(abort.signal);
  await session.push({
    type: 'runtime-open',
    namespace: axisWeightDefaults,
    runId,
    startedAt: start,
    trace,
  });

  return callback(session.context);
};
