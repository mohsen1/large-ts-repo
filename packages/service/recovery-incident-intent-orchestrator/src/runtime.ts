import {
  type OrchestrationInput,
  type OrchestrationOutput,
  type IncidentIntentRecord,
  type IncidentContext,
  type IncidentIntentPolicy,
  type IncidentIntentSignal,
  type IncidentIntentStepOutput,
  type IntentStatus,
  buildPolicies,
  buildOrchestrationPlan,
  normalizeWindow,
  type IncidentTenantId,
  createIntentRunId,
  createIntentStepId,
} from '@domain/recovery-incident-intent';
import { ok, fail, type Result } from '@shared/result';
import { OrchestratorTelemetryCollector } from './observability';
import { normalizeSignalsInput, createRepoHandle, parseRawPlan, attachPolicies, normalizeTenant } from './adapter';

interface AsyncStackLike {
  use<T>(value: T): T;
  [Symbol.asyncDispose](): Promise<void>;
}

const globalAsyncStackCtor = (): { new (): AsyncStackLike } => {
  const candidate = (globalThis as { AsyncDisposableStack?: { new (): AsyncStackLike } }).AsyncDisposableStack;
  if (candidate) return candidate;

  return class FallbackAsyncDisposableStack implements AsyncStackLike {
    readonly #disposers: Array<() => PromiseLike<void> | void> = [];
    use<T>(value: T): T {
      this.#disposers.push(async () => {
        const asDisposable = value as Partial<{ [Symbol.asyncDispose]: () => PromiseLike<void> | void }>;
        await asDisposable[Symbol.asyncDispose]?.();
      });
      return value;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        await Promise.resolve(this.#disposers[index]?.());
      }
      this.#disposers.length = 0;
    }
  };
};

const AsyncStackCtor = globalAsyncStackCtor();

export interface ExecutionSnapshot {
  readonly runId: string;
  readonly tenantId: IncidentTenantId;
  readonly status: IntentStatus;
  readonly progress: number;
}

export interface RuntimeState {
  readonly snapshots: readonly ExecutionSnapshot[];
  readonly count: number;
  readonly status: IntentStatus;
}

export interface IncidentIntentDispatcher {
  readonly tenantId: IncidentTenantId;
  execute(input: OrchestrationInput): Promise<Result<OrchestrationOutput, Error>>;
  [Symbol.asyncDispose](): Promise<void>;
}

export type OrchestratorHandle = IncidentIntentDispatcher;

export class RecoveryIncidentIntentRuntime {
  readonly #tenantId: IncidentTenantId;
  readonly #telemetry = new OrchestratorTelemetryCollector('tenant-default');

  constructor(tenantId: IncidentTenantId) {
    this.#tenantId = tenantId;
  }

  async execute(input: OrchestrationInput): Promise<Result<OrchestrationOutput, Error>> {
    await using scope = new AsyncStackCtor();
    scope.use(this.#telemetry);

    const normalizedSignals = normalizeSignalsInput(input.signals);
    const normalizedWindow = normalizeWindow(input.window);
    const policies = input.policies.length > 0
      ? input.policies
      : buildPolicies([{ title: 'default', minimumConfidence: 0.5, tags: ['default'] }]);

    const plan = await buildOrchestrationPlan({
      tenantId: input.tenantId,
      context: input.context,
      signals: normalizedSignals,
      policies,
    });

    this.#telemetry.emit('runtime:start', 'running', input.context);
    this.#telemetry.emit('runtime:signals', 'running', input.context);

    const routePolicies = plan.topPlan.phases
      .map((phase) => phase.output)
      .filter((entry): entry is IncidentIntentStepOutput => entry !== undefined)
      .map((entry, index): IncidentIntentPolicy => ({
        policyId: createIntentStepId(entry.stepId, index),
        title: `${entry.kind} policy`,
        minimumConfidence: 0.5,
        weight: {
          severity: 1,
          freshness: 1,
          confidence: 1,
          cost: 0,
        },
        tags: [entry.kind],
      }));

    const manifestRecord: IncidentIntentRecord = {
      catalogId: createIntentRunId('snapshot') as IncidentIntentRecord['catalogId'],
      tenantId: input.tenantId,
      title: `runtime-${input.context.incidentId}`,
      summary: `window:${normalizedWindow.from}->${normalizedWindow.to}`,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      nodes: plan.snapshots.flatMap((snapshot) => snapshot.nodes),
      edges: plan.snapshots.flatMap((snapshot) => snapshot.edges),
      context: input.context,
      manifestType: 'incident-intent',
      route: plan.route,
    };

    const store = createRepoHandle();
    const written = await store.writeSignalBatch(
      input.tenantId as string,
      normalizedSignals,
      routePolicies,
      manifestRecord,
      input.context,
    );
    if (!written.ok) {
      this.#telemetry.emit('runtime:store:error', 'failed', input.context);
      return fail(written.error);
    }

    this.#telemetry.emit('runtime:end', plan.status, input.context);
    return ok(plan);
  }

  snapshot(): RuntimeState {
    const state = this.#telemetry.snapshot();
    return {
      snapshots: [
        {
          runId: createIntentRunId('runtime'),
          tenantId: this.#tenantId,
          status: state.statusBuckets.length > 0 ? 'running' : 'queued',
          progress: Math.min(100, state.eventCount),
        },
      ],
      count: state.eventCount,
      status: state.eventCount > 0 ? 'running' : 'queued',
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#telemetry.clear();
    await Promise.resolve();
  }
}

export const createDispatcherHandle = (tenantId: IncidentTenantId = 'tenant-default' as IncidentTenantId): OrchestratorHandle => {
  const runtime = new RecoveryIncidentIntentRuntime(tenantId);
  return {
    tenantId,
    async execute(input: OrchestrationInput): Promise<Result<OrchestrationOutput, Error>> {
      const normalized = {
        ...input,
        tenantId,
        window: input.window ?? normalizeWindow(),
      };
      return runtime.execute(normalized);
    },
    async [Symbol.asyncDispose](): Promise<void> {
      await runtime[Symbol.asyncDispose]();
    },
  };
};

export interface RuntimeReport extends RuntimeState {
  readonly telemetry: OrchestratorTelemetryCollector;
}

export const runRecoveryIntent = async (
  input: { tenantId: string; context: IncidentContext; signals: readonly IncidentIntentSignal[]; policies: readonly IncidentIntentPolicy[] },
): Promise<Result<OrchestrationOutput, Error>> => {
  const parsed = parseRawPlan({
    tenantId: normalizeTenant(input.tenantId),
    payload: input.policies.map((policy) => policy.title).join('|') || 'bootstrap',
  });
  const merged = attachPolicies(parsed, input.policies);
  const runtime = new RecoveryIncidentIntentRuntime(merged.tenantId);
  return runtime.execute({
    tenantId: merged.tenantId,
    context: merged.context,
    signals: merged.signals,
    policies: merged.policies,
    window: normalizeWindow(),
  });
};

export const executeWithReport = async (
  input: OrchestrationInput,
): Promise<Result<RuntimeReport, Error>> => {
  const runtime = new RecoveryIncidentIntentRuntime(normalizeTenant(input.tenantId as string));
  const output = await runtime.execute(input);
  if (!output.ok) {
    await runtime[Symbol.asyncDispose]();
    return fail(output.error);
  }
  const report = runtime.snapshot();
  await runtime[Symbol.asyncDispose]();
  return ok({
    ...report,
    telemetry: new OrchestratorTelemetryCollector(input.tenantId as string),
  });
};

export const normalizeTenantIntentId = normalizeTenant;
export const createTenantFallbackRun = (tenantId: string): IncidentTenantId => normalizeTenant(tenantId);
