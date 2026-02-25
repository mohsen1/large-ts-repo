import type { NoInfer } from '@shared/type-level';
import {
  type AutonomyChannel,
  type AutonomyScope,
  type AutonomySignalEnvelope,
  type AutonomySignalInput,
  type AutonomyExecutionOutput,
  type AutonomyRunId,
  type AutonomyGraphId,
  type AutonomyRequestId,
  asSignalId,
  asRequestId,
  inferSeverityFromScore,
  toDiagnosticSignal,
} from './models';
import type { Brand } from '@shared/core';

export type PluginSlot = `${AutonomyScope}:${string}`;
export type AutonomyPluginId<TScope extends AutonomyScope = AutonomyScope> = Brand<
  `plugin:${TScope}:${string}`,
  'AutonomyPluginId'
>;
export type AutonomyPluginDependency = Brand<string, 'AutonomyPluginDependency'>;

export interface PluginContext {
  readonly tenantId: string;
  readonly runId: AutonomyRunId;
  readonly graphId: AutonomyGraphId;
  readonly scope: AutonomyScope;
  readonly requestId: AutonomyRequestId;
  readonly startedAt: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface PluginMetadata {
  readonly id: Brand<string, 'AutonomyPluginIdMeta'>;
  readonly scope: AutonomyScope;
  readonly name: string;
  readonly version: string;
  readonly slot: PluginSlot;
  readonly dependencies: readonly AutonomyPluginDependency[];
}

export interface AutonomyPluginSpec<
  TScope extends AutonomyScope = AutonomyScope,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly id: AutonomyPluginId<TScope>;
  readonly metadata: PluginMetadata;
  readonly scope: TScope;
  readonly execute: (
    input: AutonomySignalInput<TScope, TInput>,
    context: PluginContext,
  ) => Promise<AutonomyExecutionOutput<TScope, TInput, TOutput>>;
}

export interface PluginByScope<TScope extends AutonomyScope = AutonomyScope> {
  readonly id: AutonomyPluginId<TScope>;
  readonly metadata: PluginMetadata;
  readonly scope: TScope;
  execute(input: AutonomySignalInput<TScope, unknown>, context: PluginContext): Promise<AutonomyExecutionOutput<TScope, unknown, unknown>>;
}

export interface PluginSnapshot {
  readonly size: number;
  readonly scopes: readonly AutonomyScope[];
}

export class AutonomyPluginRegistry<TPlugins extends readonly AutonomyPluginSpec[] = readonly []> {
  #registry = new Map<string, AutonomyPluginSpec>();
  #scopeIndex = new Map<AutonomyScope, Set<string>>();

  constructor(initialPlugins: readonly AutonomyPluginSpec[] = []) {
    for (const plugin of initialPlugins) {
      this.register(plugin);
    }
  }

  public register<const TCandidate extends AutonomyPluginSpec>(
    plugin: NoInfer<TCandidate>,
  ): AutonomyPluginRegistry<[...TPlugins, TCandidate]> {
    this.#registry.set(String(plugin.id), plugin);
    const scopeSet = this.#scopeIndex.get(plugin.scope) ?? new Set<string>();
    scopeSet.add(String(plugin.id));
    this.#scopeIndex.set(plugin.scope, scopeSet);
    return this as unknown as AutonomyPluginRegistry<[...TPlugins, TCandidate]>;
  }

  public byScope<TScope extends AutonomyScope>(scope: TScope): readonly PluginByScope<TScope>[] {
    const scopeIds = this.#scopeIndex.get(scope);
    if (!scopeIds) {
      return [];
    }

    return [...scopeIds.values()].flatMap((id) => {
      const plugin = this.#registry.get(id);
      return plugin ? [plugin as unknown as PluginByScope<TScope>] : [];
    });
  }

  public byId<TScope extends AutonomyScope>(id: AutonomyPluginId<TScope>): AutonomyPluginSpec<TScope, unknown, unknown> | undefined {
    return this.#registry.get(String(id)) as AutonomyPluginSpec<TScope, unknown, unknown> | undefined;
  }

  public dependencyOrder<TScope extends AutonomyScope>(scope: TScope): readonly PluginByScope<TScope>[] {
    const plugins = this.byScope(scope);
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const ordered: PluginByScope<TScope>[] = [];

    const resolve = (plugin: PluginByScope<TScope>): void => {
      const current = String(plugin.id);
      if (visited.has(current)) {
        return;
      }
      if (visiting.has(current)) {
        return;
      }
      visiting.add(current);

      for (const dependency of plugin.metadata.dependencies) {
        const dependencyPlugin = this.byId({ __brand: dependency[1] } as AutonomyPluginId<TScope>);
        if (dependencyPlugin && dependencyPlugin.scope === scope) {
          resolve(dependencyPlugin as PluginByScope<TScope>);
        }
      }

      visiting.delete(current);
      visited.add(current);
      ordered.push(plugin);
    };

    for (const plugin of plugins) {
      resolve(plugin);
    }

    return ordered;
  }

  public snapshot(): PluginSnapshot {
    const entries = [...this.#registry.values()];
    return {
      size: entries.length,
      scopes: [...new Set(entries.map((entry) => entry.scope))],
    };
  }

  public async execute<TScope extends AutonomyScope, TInput = unknown, TOutput = unknown>(
    scope: TScope,
    input: AutonomySignalInput<TScope, TInput>,
    context: Omit<PluginContext, 'scope' | 'requestId'>,
    signal: AbortSignal,
  ): Promise<readonly AutonomySignalEnvelope<TScope, TInput>[]> {
    const ordered = this.dependencyOrder(scope) as readonly PluginByScope<TScope>[];
    const outputs: AutonomyExecutionOutput<TScope, TInput, TOutput>[] = [];
    for (const plugin of ordered) {
      if (signal.aborted) {
        throw new DOMException('execution aborted', 'AbortError');
      }

      const pluginInput: AutonomySignalInput<TScope, TInput> = {
        ...input,
        tags: [...input.tags, `plugin:${plugin.id}`],
      };
      const output = await (plugin.execute as (
        payload: AutonomySignalInput<TScope, TInput>,
        localContext: PluginContext,
      ) => Promise<AutonomyExecutionOutput<TScope, TInput, TOutput>>)(pluginInput, {
        ...context,
        scope,
        requestId: asRequestId(`${context.tenantId}:${context.graphId}:${Date.now()}`),
      });

      outputs.push(output);
    }

    if (!outputs.length) {
      return [
        toDiagnosticSignal(
          input,
          0,
          {
            pluginCount: 0,
            scope,
            fallback: true,
          },
        ) as unknown as AutonomySignalEnvelope<TScope, TInput>,
      ];
    }

    const emittedSignals: AutonomySignalEnvelope<TScope, TInput>[] = [];
    let index = 0;
    for (const emitted of outputs) {
      const signal = emitted.signal as unknown as AutonomySignalEnvelope<TScope, TInput>;
      emittedSignals.push({
        ...signal,
        signalId: asSignalId(`${signal.signalId}-${index++}`),
        severity: inferSeverityFromScore(signal.score),
      });
    }

    return emittedSignals.toSorted((left, right) => right.score - left.score);
  }

  public close(): void {
    this.#registry.clear();
    this.#scopeIndex.clear();
  }
}

export const pluginId = <TScope extends AutonomyScope>(scope: TScope, name: string): AutonomyPluginId<TScope> =>
  `${scope}:plugin:${name}` as AutonomyPluginId<TScope>;
