import type { NoInfer } from '@shared/type-level';
import type { PluginName } from '@shared/typed-orchestration-core';
import { EventBus } from './telemetry.js';
import { type EcosystemEvent } from './events.js';
import type { MeshPluginDefinition } from './plugins.js';
import type { PluginRuntimeContext, PluginInputEnvelope } from './types.js';
import type { RunId, TenantId, WorkspaceId, TenantWorkspace, TimelineEventId } from './brands.js';

export type AdapterLifecycle = 'ready' | 'running' | 'draining' | 'disposed';

export interface PluginAdapter {
  readonly id: PluginName;
  readonly adapterType: 'remote' | 'local' | 'mock';
  isAvailable(context: PluginRuntimeContext): Promise<boolean>;
  execute<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
    plugin: NoInfer<MeshPluginDefinition<TInput, TOutput>>,
    input: TInput,
    context: PluginRuntimeContext,
    telemetry: EventBus,
  ): Promise<TOutput>;
}

export interface AdapterRegistry {
  add(adapter: PluginAdapter): void;
  get(plugin: PluginName): PluginAdapter | undefined;
  disposeAll(): Promise<void>;
}

export class InProcessAdapterRegistry implements AdapterRegistry, AsyncDisposable {
  readonly #adapters = new Map<PluginName, PluginAdapter>();
  #lifecycle: AdapterLifecycle = 'ready';

  public add(adapter: PluginAdapter): void {
    this.#adapters.set(adapter.id, adapter);
    this.#lifecycle = 'running';
  }

  public get(plugin: PluginName): PluginAdapter | undefined {
    return this.#adapters.get(plugin);
  }

  public async run<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
    plugin: MeshPluginDefinition<TInput, TOutput>,
    input: TInput,
    context: PluginRuntimeContext,
    telemetry: EventBus,
  ): Promise<TOutput> {
    const adapter = this.#adapters.get(plugin.name);
    if (!adapter) {
      throw new Error(`No adapter for plugin ${plugin.name}`);
    }

    const available = await adapter.isAvailable(context);
    if (!available) {
      throw new Error(`Adapter unavailable for plugin ${plugin.name}`);
    }

    return adapter.execute(plugin, input, context, telemetry);
  }

  public async disposeAll(): Promise<void> {
    this.#lifecycle = 'draining';
    for (const adapter of this.#adapters.values()) {
      await adapter.isAvailable({
        runId: `run:tenant:drain:workspace:drain:${crypto.randomUUID()}` as RunId,
        tenantId: 'tenant:drain' as TenantId,
        workspaceId: 'workspace:drain' as WorkspaceId,
        startedAt: new Date().toISOString(),
        correlation: 'tenant:drain/workspace:drain' as unknown as TenantWorkspace,
        stage: 'archive',
        pluginRun: 'run-archive',
      });
    }
    this.#adapters.clear();
    this.#lifecycle = 'disposed';
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.disposeAll();
  }
}

export const createMockAdapter = (adapterId: PluginName): PluginAdapter => ({
  id: adapterId,
  adapterType: 'mock',
  async isAvailable() {
    return true;
  },
  async execute<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
    plugin: MeshPluginDefinition<TInput, TOutput>,
    input: TInput,
    context: PluginRuntimeContext,
    telemetry: EventBus,
  ): Promise<TOutput> {
    const startedAt = Date.now();
    const startedEvent: EcosystemEvent = {
      kind: 'plugin.started',
      eventId: `${context.runId}-evt-${plugin.name}` as TimelineEventId,
      pluginId: plugin.name,
      runId: context.runId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      stage: context.stage,
      at: new Date().toISOString(),
      inputHash: JSON.stringify(input).slice(0, 20),
    };

    const metadata: PluginInputEnvelope<TInput, PluginName> = {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      runId: context.runId,
      pluginName: plugin.name,
      pluginVersion: 'v1.0.0',
      payload: input,
      metadata: {
        source: adapterId,
      },
    };

    await telemetry.emit(startedEvent);

    const output = {
      success: true,
      pluginName: plugin.name,
      correlation: context.correlation,
      pluginStage: context.stage,
      payload: metadata,
      signals: [],
      notes: [`executed:${plugin.name}`],
    } as Record<string, unknown>;

    await telemetry.emit({
      kind: 'plugin.completed',
      eventId: `${context.runId}-evt-${plugin.name}-done` as TimelineEventId,
      pluginId: plugin.name,
      runId: context.runId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      stage: context.stage,
      at: new Date().toISOString(),
      outputCount: Object.keys(output).length,
      outputSignalIds: [],
      durationMs: Date.now() - startedAt,
      success: true,
    });

    return output as TOutput;
  },
});
