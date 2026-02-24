import { z } from 'zod';
import type {
  EventEnvelope,
  EventChannel,
  EventKind,
  EventSeverity,
} from '@shared/typed-orchestration-core/runtime-events';
import { EventBus } from '@shared/typed-orchestration-core/runtime-events';
import {
  PluginDefinition,
  PluginRegistry,
  type PluginStatus,
  resolveExecutionOrder,
} from '@shared/typed-orchestration-core/registry';
import { Brand, asBrand } from '@shared/typed-orchestration-core/brands';
import { AsyncScopeFence, withAsyncScope } from '@shared/typed-orchestration-core/disposables';

export type EngineRunId = Brand<string, 'RunId'>;
export type EngineScopeId = Brand<string, 'EngineScopeId'>;

export type EnginePayload<TInput = unknown, TOutput = unknown> = {
  readonly runId: EngineRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly input: TInput;
  readonly output: TOutput;
};

export type EnginePluginDefinition<TInput, TOutput> = PluginDefinition<TInput, TOutput, `plugin:${string}`>;
export type EngineEventEnvelope<TPayload, TName extends `${string}/${string}` = `${string}/${string}`> = EventEnvelope<
  TPayload,
  EventChannel,
  EventKind
> & {
  readonly event: TName;
};

export const runtimeEnvelopeSchema = z.object({
  runId: z.string(),
  tenant: z.string(),
  event: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
});

export interface EngineExecutionContext<TInput> {
  readonly runId: EngineRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly startedAt: string;
  readonly input: TInput;
}

export interface EngineOptions {
  readonly throttleMs?: number;
  readonly includeTrace?: boolean;
  readonly includeSummary?: boolean;
}

export interface EngineRunResult<TOutput> {
  readonly id: EngineRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly stageCount: number;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly output: TOutput;
}

const isRuntimeEvent = (value: unknown): value is EnginePayload<unknown, unknown> => {
  return runtimeEnvelopeSchema.safeParse(value).success;
};

const isPluginStatus = (value: unknown): value is PluginStatus =>
  value === 'running' ||
  value === 'success' ||
  value === 'skipped' ||
  value === 'error' ||
  value === 'cancelled';

export class OrchestrationEngine<TInput, TOutput> {
  readonly #bus: EventBus<Record<string, EventEnvelope<unknown>>>;
  readonly #registry: PluginRegistry;
  readonly #plugins: readonly EnginePluginDefinition<TInput, TOutput>[];

  public constructor(
    plugins: readonly EnginePluginDefinition<TInput, TOutput>[],
    private readonly options: EngineOptions = {},
  ) {
    this.#plugins = plugins;
    this.#registry = new PluginRegistry(plugins as unknown as readonly PluginDefinition<
      unknown,
      unknown,
      `plugin:${string}`
    >[]);
    this.#bus = new EventBus();
  }

  public plugins(): readonly EnginePluginDefinition<TInput, TOutput>[] {
    return this.#plugins;
  }

  public orderedPlugins(): readonly EnginePluginDefinition<TInput, TOutput>[] {
    const order = resolveExecutionOrder(this.#registry);
    const registryEntries = order
      .map((name) => this.#registry.get(name))
      .filter((entry): entry is PluginDefinition<unknown, unknown, `plugin:${string}`> => entry !== undefined);
    return registryEntries as readonly EnginePluginDefinition<TInput, TOutput>[];
  }

  public async run(
    input: TInput,
    tenant: Brand<string, 'TenantId'> = asBrand('tenant:quantum', 'TenantId'),
  ): Promise<EngineRunResult<TOutput>> {
    const startedAt = new Date().toISOString();
    const runId = asBrand(`run-${Date.now()}`, 'RunId');
    let output = input as unknown as TOutput;

    await withAsyncScope(
      () => [
        new AsyncScopeFence(
          {
            namespace: 'namespace:engine',
            tags: ['startup', 'runtime'],
          },
          async () => {
            this.#bus.publish(
              `runtime:${runId}/boot` as const,
              {
                id: `event-${runId}-boot`,
                channel: 'channel:engine',
                kind: 'kind:trace',
                event: 'runtime/trace',
                severity: 'low',
                timestamp: new Date().toISOString(),
                payload: {
                  runId,
                  tenant,
                  event: 'boot',
                  severity: 'low',
                },
              },
            );
          },
        ),
        null,
      ],
      async () => {
        for (const [index, plugin] of this.orderedPlugins().entries()) {
          const stagePayload = {
            runId,
            tenant,
            event: 'stage-start',
            severity: 'low' as const,
          };

          if (!isRuntimeEvent(stagePayload)) {
            throw new Error(`Invalid runtime envelope for ${plugin.name}`);
          }

          const result = await plugin.run(input, {
            id: asBrand(`stage:${index}:${plugin.name}`, 'StageEventId'),
            namespace: plugin.namespace,
            startedAt: new Date().toISOString(),
            correlation: {
              runId,
              tenant,
            },
            input,
          });

          if (result.status === 'error') {
            throw new Error(result.message);
          }

          this.#bus.publish(
            `runtime:${plugin.namespace}:${plugin.version}` as const,
            {
              id: `event-${result.status}-${Date.now()}`,
              channel: 'channel:plugin',
              kind: 'kind:event',
              event: `${plugin.namespace}/${plugin.version}`,
              severity: 'medium',
              timestamp: new Date().toISOString(),
              payload: {
                runId,
                tenant,
                event: 'plugin-complete',
                severity: 'medium',
                status: result.status,
              },
            },
          );

          if (result.status === 'success' && result.output !== null) {
            output = result.output;
          }

          if (this.options.throttleMs && this.options.throttleMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.options.throttleMs));
          }
        }
      },
    );

    const durationMs = performance.now() - Date.parse(startedAt);
    if (this.options.includeTrace) {
      for (const envelope of this.#bus.stream()) {
        if (isRuntimeEvent(envelope.payload)) {
          continue;
        }
      }
    }

    return {
      id: runId,
      tenant,
      stageCount: resolveExecutionOrder(this.#registry).length,
      durationMs,
      startedAt,
      output: output,
    };
  }

  public diagnostics(severities: readonly PluginStatus[]) {
    const events = [...this.#bus.stream()] as readonly EngineEventEnvelope<unknown, `${string}/${string}`>[];
    const selected: EngineEventEnvelope<unknown, `${string}/${string}`>[] = [];
    for (const event of events) {
      const status = (event.payload as { status?: PluginStatus })?.status;
      if ((status && isPluginStatus(status) && severities.includes(status)) || severities.includes(event.severity as PluginStatus)) {
        selected.push(event);
      }
      if (selected.length >= 16) {
        break;
      }
    }

    return selected.map((event) => ({
      event: event.event,
      severity: event.severity,
      payload: event.payload,
    }));
  }
}

export interface EngineTelemetry {
  readonly event: string;
  readonly severity: EventSeverity;
  readonly startedAt: string;
}

export const buildEngineTelemetry = (entries: readonly EngineEventEnvelope<unknown, `${string}/${string}`>[]): EngineTelemetry[] =>
  entries.map((entry) => ({
    event: entry.event,
    severity: entry.severity,
    startedAt: entry.timestamp,
  }));
