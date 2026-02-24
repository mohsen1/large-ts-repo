import { withBrand } from '@shared/core';
import { SagaEventBus, SagaPluginRegistry, type SagaEventEnvelope, toNamespace } from '@shared/incident-saga-core';
import type { SagaRun, SagaPlan, SagaPolicy } from '@domain/recovery-incident-saga';
import { createDefaultPlugins, type PluginRuntimeContext } from './plugins';
import { parsePolicyPayload, parseRunPayload, parseScenarioBundle } from '@domain/recovery-incident-saga';
import { bundleFromRuntimeInput, summarizeBundle, type RuntimeBundle, type RuntimeInput } from './adapters';
import { runEngine } from './engine';
import type { Result } from '@shared/type-level';

export interface SagaRuntimeConfig {
  readonly runtimeId: string;
  readonly namespace: string;
}

export interface SagaRuntimeSnapshot {
  readonly runId: string;
  readonly state: 'idle' | 'running' | 'done' | 'failed';
  readonly events: readonly SagaEventEnvelope[];
}

export interface SagaRuntime {
  run(payload: unknown): Promise<Result<SagaRuntimeSnapshot, Error>>;
  close(): Promise<void>;
  snapshot(): SagaRuntimeSnapshot;
  [Symbol.asyncDispose](): Promise<void>;
}

const runtimeDefaults = {
  pluginConcurrency: 4,
  publishBatch: 64,
  drainTimeoutMs: 100,
} as const;

const runtimeEventNamespace = (namespace: string): `saga:${string}` =>
  namespace.startsWith('saga:') ? (namespace as `saga:${string}`) : `saga:${namespace}`;

const emitEvent = (bus: SagaEventBus<{ run: unknown; plan: unknown; policy: unknown }>, event: SagaEventEnvelope): void => {
  bus.publish('run', event, {
    runId: withBrand(`${event.eventId}`, 'SagaRunId'),
    runNamespace: runtimeEventNamespace(event.namespace),
    phase: 'prepare',
    startedAt: event.recordedAt,
    traceId: withBrand(`${event.eventId}-trace`, 'SagaTraceId'),
  });
};

export const createSagaRuntime = (config: SagaRuntimeConfig): SagaRuntime => {
  const eventBus = new SagaEventBus<{
    run: unknown;
    plan: unknown;
    policy: unknown;
  }>();

  let state: SagaRuntimeSnapshot = {
    runId: `${config.runtimeId}-not-started`,
    state: 'idle',
    events: [],
  };

  const makeContext = (run: SagaRun, plan: SagaPlan, policy: SagaPolicy): PluginRuntimeContext => {
    const contextRuntime = {
      runtimeId: config.runtimeId,
      tenant: config.namespace,
    };
    return {
      run,
      plan,
      policy,
      runtime: contextRuntime,
      sink: {
        emit(event) {
          eventBus.publish('run', event, {
            runId: run.id,
            runNamespace: toNamespace(run.domain),
            phase: 'execute',
            startedAt: new Date().toISOString(),
            traceId: withBrand(`${run.id}-trace`, 'SagaTraceId'),
          });
          state = {
            ...state,
            events: [...state.events, event],
          };
        },
      },
    };
  };

  const bootstrap = async (run: SagaRun, plan: SagaPlan, policy: SagaPolicy): Promise<void> => {
    const context = makeContext(run, plan, policy);
    const runtimeRegistry = new SagaPluginRegistry(createDefaultPlugins(context));
    const options = {
      namespace: `saga:${run.domain}` as const,
      enabled: true,
      priority: 'normal' as const,
      timeoutMs: runtimeDefaults.publishBatch,
    };

    await runtimeRegistry.bootstrap('validation', context, options);
    await runtimeRegistry.bootstrap('dispatch', context, options);
    await runtimeRegistry.bootstrap('replay', context, options);
    await runtimeRegistry.shutdown();
  };

  return {
    async run(payload: unknown): Promise<Result<SagaRuntimeSnapshot, Error>> {
      try {
        state = { ...state, state: 'running' };
        const runtimeInput = payload as RuntimeInput;
        const normalized = bundleFromRuntimeInput(runtimeInput);
        const parsed = parseScenarioBundle(normalized.bundle);
        const run = parseRunPayload(parsed.run);
        const policy = parsePolicyPayload(parsed.policy);
        const plan = parsed.plan;

        emitEvent(eventBus, {
          eventId: withBrand(`${config.runtimeId}-boot`, 'event:saga:runtime'),
          namespace: `saga:${run.domain}`,
          kind: `saga:runtime::prepare`,
          payload: {
            runId: run.id,
            topology: normalized.topology.length,
            summary: summarizeBundle(normalized),
          },
          recordedAt: new Date().toISOString(),
          tags: ['tag:prepare'],
        });

        await bootstrap(run, plan, policy);
        const result = await runEngine({ run, plan, policy, runtimeId: config.runtimeId });
        if (!result.ok) {
          state = {
            ...state,
            state: 'failed',
            events: [...state.events, ...eventBus.drain()],
          };
          return { ok: false, error: result.error };
        }

        state = {
          ...state,
          state: 'done',
          runId: run.id,
          events: [...state.events, ...eventBus.drain()],
        };
        return { ok: true, value: { ...state } };
      } catch (error) {
        state = {
          ...state,
          state: 'failed',
        };
        return {
          ok: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      } finally {
        state = {
          ...state,
          events: [...state.events],
        };
      }
    },

    async close(): Promise<void> {
      state = { ...state, state: 'done' };
    },

    snapshot(): SagaRuntimeSnapshot {
      return {
        ...state,
        events: [...state.events],
      };
    },

    async [Symbol.asyncDispose](): Promise<void> {
      await this.close();
    },
  };
};

export const runWithRuntime = async (
  config: SagaRuntimeConfig,
  payload: unknown,
): Promise<Result<SagaRuntimeSnapshot, Error>> => {
  const runtime = createSagaRuntime(config);
  try {
    return await runtime.run(payload);
  } finally {
    await runtime.close();
  }
};

export { summarizeBundle };

