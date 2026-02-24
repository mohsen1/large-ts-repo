import { type NoInfer } from '@shared/type-level';
import type { Brand } from '@shared/core';
import {
  type IncidentTenantId,
  type IntentRunId,
  type IncidentIntentStepInput,
  type IncidentIntentStepOutput,
  type IncidentIntentSignal,
  type IncidentIntentPhasePlan,
  type IncidentIntentPlan,
} from './types';

export type IncidentIntentPluginId = Brand<string, 'IncidentIntentPluginId'>;
export type IncidentIntentPluginPhase = 'discover' | 'plan' | 'execute' | 'report';

export interface IncidentIntentPluginDescriptor<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly id: IncidentIntentPluginId;
  readonly name: TName;
  readonly label: string;
  readonly phase: IncidentIntentPluginPhase;
  readonly version: `${number}.${number}.${number}`;
  readonly dependencies: readonly IncidentIntentPluginId[];
  readonly supports: readonly string[];
  setup(input: TInput): Promise<TOutput>;
}

export type RegistryInput<TName extends string, TInput, TOutput> =
  Readonly<IncidentIntentPluginDescriptor<TName, TInput, TOutput>>;

export interface IncidentIntentPluginResult<TOutput = unknown> {
  readonly pluginId: IncidentIntentPluginId;
  readonly status: 'ok' | 'skip' | 'error';
  readonly runId: IntentRunId;
  readonly tenantId: IncidentTenantId;
  readonly output?: TOutput;
  readonly reason?: string;
  readonly elapsedMs: number;
}

export interface IncidentIntentPluginEnvelope {
  readonly runId: IntentRunId;
  readonly tenantId: IncidentTenantId;
  readonly manifestId: string;
}

export type IncidentIntentPluginResultMap<TPlugins extends readonly RegistryInput<string, unknown, unknown>[]> =
  { [K in keyof any]: unknown } & { [index in TPlugins[number]['id']]: unknown };

export interface IncidentIntentExecutionFrame {
  readonly runId: IntentRunId;
  readonly tenantId: IncidentTenantId;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly signals: readonly IncidentIntentSignal[];
  readonly input: Readonly<IncidentIntentStepInput>;
  readonly output: Readonly<IncidentIntentPhasePlan>;
  readonly pluginResults: readonly IncidentIntentPluginResult[];
}

const nowMs = (): number => Date.now();

export class IncidentIntentPluginRegistry<
  const TPlugins extends readonly RegistryInput<string, unknown, unknown>[],
> {
  readonly #definitions: Map<IncidentIntentPluginId, RegistryInput<string, unknown, unknown>>;
  readonly #outputs = new Map<IncidentIntentPluginId, unknown>();
  readonly #stack = new Set<IncidentIntentPluginId>();

  constructor(plugins: NoInfer<TPlugins>) {
    this.#definitions = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  }

  async boot<
    TPluginId extends TPlugins[number]['id'],
    TInput extends TPlugins[number] extends infer TEntry
      ? TEntry extends { id: TPluginId; setup: (input: infer TInput) => Promise<unknown> }
        ? TInput
        : never
      : never,
  >(
    pluginId: TPluginId,
    input: NoInfer<TInput>,
  ): Promise<IncidentIntentPluginResult<unknown>> {
    const plugin = this.#definitions.get(pluginId);
    if (!plugin) {
      return {
        pluginId,
        status: 'error',
        runId: `${pluginId}-missing` as IntentRunId,
        tenantId: 'tenant-default' as IncidentTenantId,
        reason: `plugin not found: ${pluginId}`,
        elapsedMs: 0,
      };
    }

    if (this.#stack.has(pluginId)) {
      return {
        pluginId,
        status: 'skip',
        runId: `${pluginId}-skip` as IntentRunId,
        tenantId: 'tenant-default' as IncidentTenantId,
        reason: `circular dependency: ${pluginId}`,
        elapsedMs: 0,
      };
    }

    for (const dependency of plugin.dependencies) {
      if (!this.#outputs.has(dependency)) {
        await this.boot(dependency as TPluginId, input as never);
      }
    }

    const startedAt = nowMs();
    this.#stack.add(pluginId);
    try {
      const output = await plugin.setup(input);
      this.#outputs.set(pluginId, output);
      return {
        pluginId,
        status: 'ok',
        runId: `${pluginId}-${startedAt}` as IntentRunId,
        tenantId: 'tenant-default' as IncidentTenantId,
        output,
        elapsedMs: nowMs() - startedAt,
      };
    } catch (error) {
      return {
        pluginId,
        status: 'error',
        runId: `${pluginId}-${startedAt}` as IntentRunId,
        tenantId: 'tenant-default' as IncidentTenantId,
        reason: error instanceof Error ? error.message : 'unknown',
        elapsedMs: nowMs() - startedAt,
      };
    } finally {
      this.#stack.delete(pluginId);
    }
  }

  outputs(): Partial<IncidentIntentPluginResultMap<TPlugins>> {
    return Object.fromEntries(this.#outputs.entries()) as Partial<IncidentIntentPluginResultMap<TPlugins>>;
  }

  plugins(): readonly RegistryInput<string, unknown, unknown>[] {
    return [...this.#definitions.values()] as readonly RegistryInput<string, unknown, unknown>[];
  }

  clear(): void {
    this.#outputs.clear();
    this.#stack.clear();
  }
}

export class IncidentIntentFrameScope {
  readonly #frames: IncidentIntentExecutionFrame[] = [];
  push(frame: IncidentIntentExecutionFrame): void {
    this.#frames.push(frame);
  }

  snapshot(): readonly IncidentIntentExecutionFrame[] {
    return [...this.#frames];
  }

  [Symbol.iterator](): IterableIterator<IncidentIntentExecutionFrame> {
    return this.#frames[Symbol.iterator]();
  }

  clear(): void {
    this.#frames.length = 0;
  }

  [Symbol.dispose](): void {
    this.clear();
  }
}

export const pluginSupports = <TName extends string>(names: readonly TName[]) =>
  new Set(names) as ReadonlySet<TName>;

export const resolvePhasePath = <TName extends string>(plugin: Readonly<IncidentIntentPluginDescriptor<TName>>): readonly string[] =>
  [plugin.phase, ...plugin.supports].toSorted();

export interface IncidentIntentPluginMetrics {
  readonly pluginCount: number;
  readonly byPhase: Record<IncidentIntentPluginPhase, number>;
  readonly lastUpdated: string;
}

export const summarizePlugins = <TPlugins extends readonly RegistryInput<string, unknown, unknown>[]>(plugins: TPlugins): IncidentIntentPluginMetrics => {
  const buckets = plugins.reduce<IncidentIntentPluginMetrics>(
    (acc, plugin) => {
      acc.byPhase[plugin.phase] = acc.byPhase[plugin.phase] + 1;
      return acc;
    },
    {
      pluginCount: plugins.length,
      byPhase: {
        discover: 0,
        plan: 0,
        execute: 0,
        report: 0,
      },
      lastUpdated: new Date().toISOString(),
    },
  );
  return buckets;
};
