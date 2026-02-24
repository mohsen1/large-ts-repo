import {
  createRouteNamespace,
  createRunId,
  createSessionId,
  type ArcaneCatalogKind,
  type ArcaneCatalogMap,
  type ArcaneInputOf,
  type ArcaneOutputOf,
  type ArcanePlugin,
  type ArcanePluginKind,
  type ArcaneRuntimeEvent,
  type ArcaneSessionId,
  type ArcaneStatus,
  type ArcaneWorkspaceEvent,
  type ArcaneWorkspaceState,
  ArcanePluginResult,
} from './types';
import { createAsyncDisposableStack } from '@shared/recovery-orchestration-runtime';
import { type NoInfer } from '@shared/type-level';

type KindIndex<TCatalog extends readonly ArcanePlugin[]> = {
  [K in ArcaneCatalogKind<TCatalog>]: readonly Extract<TCatalog[number], { readonly manifest: { readonly kind: K } }>[];
};

export class ArcanePluginRegistry<TCatalog extends readonly ArcanePlugin[]> {
  readonly #catalog: TCatalog;
  readonly #session: ArcaneSessionId;
  readonly #byKind = new Map<ArcaneCatalogKind<TCatalog>, readonly ArcanePlugin[]>();
  readonly #events: ArcaneRuntimeEvent[] = [];

  public constructor(tenantId: string, catalog: NoInfer<TCatalog>) {
    this.#catalog = catalog;
    this.#session = createSessionId(`${tenantId}-${String(Date.now())}`);
    this.#index(catalog);
  }

  public manifest(): ArcaneCatalogMap<TCatalog> {
    const accumulator = {
      predictive: [],
      decision: [],
      playbook: [],
      telemetry: [],
      policy: [],
      signal: [],
    } as {
      [kind: string]: readonly ArcanePlugin[];
    };

    for (const kind of ['predictive', 'decision', 'playbook', 'telemetry', 'policy', 'signal']) {
      const list = toList(this.#byKind.get(kind as ArcaneCatalogKind<TCatalog>) ?? []);
      list.sort((left, right) => right.manifest.priority - left.manifest.priority);
      accumulator[kind] = list;
    }

    return accumulator as ArcaneCatalogMap<TCatalog>;
  }

  public async run<TKind extends ArcaneCatalogKind<TCatalog>>(
    kind: NoInfer<TKind>,
    input: ArcaneInputOf<TCatalog, TKind>,
    workspace: ArcaneWorkspaceState,
    context: {
      readonly sessionId: ArcaneSessionId;
      readonly traceToken: string;
      readonly route: string;
    },
  ): Promise<readonly ArcaneOutputOf<TCatalog, TKind>[]> {
    const candidates = this.#byKind.get(kind) ?? [];
    if (candidates.length === 0) {
      return [];
    }

    const stack = createAsyncDisposableStack();
    await using _scope = stack;
    stack.use(new RegistryScope(context.sessionId));

    const selected = candidates.filter((candidate) => candidate.manifest.route.includes(context.route));
    const targets = selected.length > 0 ? selected : candidates;

    const output = await Promise.all(
      targets.map(async (candidate): Promise<ArcaneOutputOf<TCatalog, TKind>> => {
        const result = await candidate.run(input as never, {
          tenantId: workspace.tenantId,
          workspaceId: workspace.workspaceId,
          runId: createRunId(`${context.sessionId}-${candidate.manifest.pluginId}` as string),
          status: 'running',
          activeRoute: candidate.manifest.route,
          channel: createRouteNamespace(context.traceToken),
          metadata: {
            sourceSession: context.sessionId,
            namespace: workspace.namespace,
          },
        } as never);

        this.#events.push({
          tenantId: workspace.tenantId,
          pluginId: candidate.manifest.pluginId,
          kind: candidate.manifest.kind,
          at: new Date().toISOString(),
          status: result.ok ? 'ready' : 'failed',
          source: context.sessionId,
          workspaceId: workspace.workspaceId,
          confidence: result.ok ? 0.9 : 0,
        });

        if (!result.ok) {
          throw new Error(result.error?.message ?? `plugin ${candidate.manifest.pluginId} failed`);
        }

        return (result as ArcanePluginResult<ArcaneOutputOf<TCatalog, TKind>>).value as ArcaneOutputOf<TCatalog, TKind>;
      }),
    );

    stack.use(new RegistryScope(context.sessionId));
    return output;
  }

  public events(): readonly ArcaneRuntimeEvent[] {
    return [...this.#events];
  }

  public audit(since: string): readonly ArcaneRuntimeEvent[] {
    const min = Number(new Date(since).valueOf());
    if (!Number.isFinite(min)) {
      return [...this.#events];
    }
    return this.#events.filter((entry) => Number(new Date(entry.at).valueOf()) >= min);
  }

  public replay(session: ArcaneSessionId): readonly ArcaneWorkspaceEvent[] {
    const filtered = this.#events.filter((entry) => entry.source === session);
    return filtered.map((entry) => ({
      type: 'plugin/selected',
      tenantId: entry.tenantId,
      workspaceId: entry.workspaceId,
      at: entry.at,
      pluginId: entry.pluginId,
      kindFilter: entry.kind,
      payload: { status: entry.status },
    }));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#events.length = 0;
    return this.#events.slice() && undefined;
  }

  #index(catalog: readonly ArcanePlugin[]): void {
    for (const plugin of catalog) {
      const bucket = this.#byKind.get(plugin.manifest.kind) ?? [];
      this.#byKind.set(plugin.manifest.kind, [...bucket, plugin]);
    }
  }
}

class RegistryScope implements AsyncDisposable {
  public constructor(readonly token: string) {}

  public [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }

  public [Symbol.dispose](): void {
    void 0;
  }
}

export const createArcaneRegistry = <TCatalog extends readonly ArcanePlugin[]>(
  catalog: NoInfer<TCatalog>,
): ArcanePluginRegistry<TCatalog> => {
  const first = catalog[0];
  const tenant = first?.manifest.tenantId ?? ('tenant-default' as string);
  return new ArcanePluginRegistry(tenant, catalog);
};

const toList = <T>(value: readonly T[]): T[] => value.slice();
