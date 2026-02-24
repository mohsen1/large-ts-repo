import { type NoInfer } from '@shared/type-level';
import {
  type RuntimeManifest,
  type RuntimePlugin,
  type RuntimePluginId,
  type RuntimePlugin as RuntimePluginType,
  type RuntimeScope,
  runtimeEventChannel,
  createPluginId,
  type RuntimeExecutionLog,
  type RuntimeRunId,
  type RuntimeSessionId,
  type RuntimeTenantId,
  type RuntimeWorkspaceId,
  type RuntimeContext,
  type RuntimePolicyMode,
  type RuntimeEventChannel,
  runtimeScopes,
} from './types.js';

interface ManifestNode {
  readonly manifest: RuntimeManifest;
  readonly manifestId: string;
  readonly index: number;
}

type PluginNode<TPlugins extends readonly RuntimeManifest[]> = {
  readonly [K in keyof TPlugins]: TPlugins[K]['plugin'];
};

export interface RegistrySnapshot {
  readonly pluginCount: number;
  readonly scopeCount: number;
  readonly hasDisposables: boolean;
  readonly hasOrdered: boolean;
  readonly lastSnapshotAt: string;
}

const iteratorFrom =
  (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { toArray(): T[] } } }).Iterator?.from;

export class RuntimePluginRegistry<TManifests extends readonly RuntimeManifest[]> implements AsyncDisposable {
  readonly #manifests: TManifests;
  readonly #byId = new Map<string, RuntimeManifest>();
  readonly #byName = new Map<string, RuntimeManifest>();
  readonly #byScope = new Map<RuntimeScope, Set<string>>();
  readonly #scopeOrder: RuntimeScope[] = [...runtimeScopes];
  readonly #ordered: RuntimeManifest[] = [];
  readonly #logs: RuntimeExecutionLog[] = [];
  #disposed = false;

  public constructor(manifests: NoInfer<TManifests>) {
    this.#manifests = manifests;
    this.#install(manifests);
  }

  public get ordered(): readonly RuntimeManifest[] {
    return [...this.#ordered];
  }

  public get logs(): readonly RuntimeExecutionLog[] {
    return [...this.#logs];
  }

  public has(manifestId: RuntimePluginId): boolean {
    return this.#byId.has(manifestId);
  }

  public get manifestCount(): number {
    return this.#manifests.length;
  }

  public get snapshot(): RegistrySnapshot {
    return {
      pluginCount: this.#manifests.length,
      scopeCount: this.#byScope.size,
      hasDisposables: this.#ordered.length > 0,
      hasOrdered: this.#ordered.length > 0,
      lastSnapshotAt: new Date().toISOString(),
    };
  }

  public plugin<T extends RuntimeManifest>(id: T['plugin']['id']): T | null {
    return (this.#byId.get(String(id)) ?? null) as T | null;
  }

  public getByName<T extends RuntimeManifest['name']>(name: T): RuntimeManifest | null {
    return this.#byName.get(name) ?? null;
  }

  public byScope<TScope extends RuntimeScope>(scope: TScope): readonly RuntimeManifest[] {
    const values = [...(this.#byScope.get(scope) ?? new Set())].map((id) => this.#byId.get(id)!).filter(Boolean);
    return this.#scopeOrder
      .filter((entry) => entry === scope)
      .flatMap(() => values.toSorted((left, right) => left.plugin.name.localeCompare(right.plugin.name)));
  }

  public pluginsByCategory<TCategory extends RuntimeScope>(category: TCategory): readonly RuntimePluginType[] {
    return this.byScope(category).map((entry) => entry.plugin);
  }

  public listScopeKeys<T extends readonly RuntimeScope[]>(scopes: NoInfer<T>): readonly T[number][] {
    return scopes.filter((scope): scope is T[number] => this.#byScope.has(scope));
  }

  public get mapByName(): Record<string, RuntimePlugin> {
    const entries = this.#ordered
      .map((manifest) => manifest.plugin)
      .map((plugin) => [plugin.name, plugin] as const);
    return Object.fromEntries(entries);
  }

  public get mapByChannel(): Record<string, RuntimeManifest> {
    const channelEntries = this.#ordered.map((manifest) => [manifest.channel, manifest]);
    return Object.fromEntries(channelEntries);
  }

  public list(filterScope?: RuntimeScope): readonly RuntimeManifest[] {
    if (!filterScope) {
      return this.ordered;
    }
    return this.byScope(filterScope);
  }

  public resolveOrder(): readonly RuntimeManifest[] {
    if (this.#ordered.length > 0) {
      return this.ordered;
    }
    const byId = new Map(this.#ordered.map((entry) => [entry.plugin.id as string, entry] as const));
    const result: RuntimeManifest[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (entry: RuntimeManifest): void => {
      const pluginId = entry.plugin.id as string;
      if (visited.has(pluginId)) {
        return;
      }
      if (visiting.has(pluginId)) {
        throw new Error(`cycle detected at ${pluginId}`);
      }
      visiting.add(pluginId);

      const pluginDeps = entry.plugin.dependencies;
      for (const dependency of pluginDeps) {
        const dependencyPlugin = this.#byId.get(String(dependency));
        if (dependencyPlugin) {
          visit(dependencyPlugin);
        }
      }

      visiting.delete(pluginId);
      visited.add(pluginId);
      this.#ordered.push(entry);
      result.push(entry);
    };

    for (const manifest of this.#manifests) {
      visit(manifest);
    }
    return result.toSorted((left, right) => left.priority - right.priority);
  }

  public async runSequence<TInput, TOutput>(
    input: TInput,
    context: Omit<RuntimeContext, 'scope' | 'stage'> & {
      readonly tenantId: RuntimeTenantId;
      readonly workspaceId: RuntimeWorkspaceId;
      readonly sessionId: RuntimeSessionId;
    },
    emit: (event: {
      readonly kind: 'plugin.started' | 'plugin.completed' | 'plugin.failed';
      readonly pluginId: RuntimePluginId;
      readonly scope: RuntimeScope;
      readonly channel: RuntimeEventChannel;
      readonly at: string;
      readonly details: { readonly pluginName: string; readonly stage: string; readonly mode: RuntimePolicyMode };
    }) => Promise<void>,
  ): Promise<TOutput> {
    const order = this.resolveOrder();
    const iterator = iteratorFrom?.(order);
    const ordered = iterator ? iterator.toArray() : order;

    let current: unknown = input;
    for (const entry of ordered) {
      const manifest = entry as ManifestNode['manifest'];
      const plugin = manifest.plugin as RuntimePluginType;
      const pluginId = plugin.id;
      const channel = runtimeEventChannel(plugin.scope, context.runId);
      const startedAt = new Date().toISOString();
      this.#logs.push({
        pluginId,
        pluginName: plugin.name,
        scope: plugin.scope,
        startedAt,
        finishedAt: '',
        eventChannel: channel,
      });
      await emit({
        kind: 'plugin.started',
        pluginId,
        scope: plugin.scope,
        channel,
        at: startedAt,
        details: {
          pluginName: plugin.name,
          stage: plugin.stage,
          mode: plugin.mode,
        },
      });

      const pluginRunContext: RuntimeContext = {
        runId: context.runId,
        sessionId: context.sessionId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        scope: plugin.scope,
        stage: plugin.stage,
        mode: plugin.mode,
        startedAt,
        metadata: {
          manifest: manifest.group,
          stage: plugin.stage,
          channel,
        },
      };

      try {
        const next = await plugin.execute(current, pluginRunContext);
        current = next;
        const completedAt = new Date().toISOString();
        await emit({
          kind: 'plugin.completed',
          pluginId,
          scope: plugin.scope,
          channel,
          at: completedAt,
          details: {
            pluginName: plugin.name,
            stage: plugin.stage,
            mode: plugin.mode,
          },
        });
        const lastLog = this.#logs.at(-1);
        if (lastLog) {
          const finishedAt = completedAt;
          const runtimeLogIndex = this.#logs.length - 1;
          this.#logs[runtimeLogIndex] = {
            ...lastLog,
            finishedAt,
            eventChannel: channel,
          };
        }
      } catch (error) {
        const failedAt = new Date().toISOString();
        this.#logs.push({
          pluginId,
          pluginName: plugin.name,
          scope: plugin.scope,
          startedAt,
          finishedAt: failedAt,
          eventChannel: channel,
        });
        await emit({
          kind: 'plugin.failed',
          pluginId,
          scope: plugin.scope,
          channel,
          at: failedAt,
          details: {
            pluginName: plugin.name,
            stage: plugin.stage,
            mode: plugin.mode,
          },
        });
        throw error;
      }
    }

    return current as TOutput;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#ordered.length = 0;
    this.#logs.length = 0;
    this.#byId.clear();
    this.#byName.clear();
    this.#byScope.clear();
  }

  readonly #install = (manifests: readonly RuntimeManifest[]): void => {
    const byId = this.#byId;
    const byName = this.#byName;
    const byScope = this.#byScope;

    for (const manifest of manifests) {
      byId.set(manifest.plugin.id as string, manifest);
      byName.set(manifest.plugin.name as string, manifest);

      const scope = manifest.plugin.scope;
      const bucket = byScope.get(scope) ?? new Set<string>();
      bucket.add(manifest.plugin.id as string);
      byScope.set(scope, bucket);
    }

    const pluginNodes: ManifestNode[] = manifests.map((manifest, index) => ({
      manifest,
      manifestId: createPluginId(String(index), manifest.plugin.stage),
      index,
    }));
    void pluginNodes;
  };
}
