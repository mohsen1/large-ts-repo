import { type NoInfer } from '@shared/type-level';
import { type TenantId } from '../models';
import {
  type CampaignEventName,
  type CampaignNamespace,
  type CampaignPhase,
  type CampaignPlugin,
  type CampaignPluginId,
  type CampaignSessionId,
  type PluginCatalogKind,
  type PluginInputOf,
  type PluginOutputOf,
  createCampaignId,
  createCampaignSessionId,
} from './types';

type CampaignManifest = Readonly<Record<string, readonly CampaignPluginId[]>>;

interface CampaignRegistryRuntime {
  readonly tenantId: TenantId;
  readonly startedAt: string;
  pluginRunCount: number;
}

interface CampaignRegistryEvent {
  readonly tenantId: TenantId;
  readonly campaignId: CampaignSessionId;
  readonly pluginId: CampaignPluginId;
  readonly kind: PluginCatalogKind<readonly CampaignPlugin[]>;
  readonly at: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly name: ReturnType<CampaignEventNameFactory>;
}

type CampaignEventNameFactory = <T extends string>(tenantId: TenantId, campaignId: CampaignSessionId, phase: T) => string;

class CampaignScope implements Disposable, AsyncDisposable {
  readonly #runtime: CampaignRegistryRuntime;
  #disposed = false;

  public constructor(runtime: CampaignRegistryRuntime) {
    this.#runtime = runtime;
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
  }
}

const iteratorFrom =
  (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { map<U>(transform: (value: T) => U): { toArray(): U[] } } } }).Iterator?.from;

const safeNamespace = (namespace: string): CampaignNamespace => `${namespace}::campaign` as CampaignNamespace;

const buildEventName: CampaignEventNameFactory = (tenantId, campaignId, phase) =>
  `${safeNamespace(String(tenantId))}:${campaignId}:${phase}` as CampaignEventName<string>;

const manifestKeys = <T extends string>(kind: T): `kind:${T}` => `kind:${kind}` as const;

export class CampaignPluginRegistry<TCatalog extends readonly CampaignPlugin[]>
  implements AsyncDisposable, Disposable
{
  readonly #tenantId: TenantId;
  readonly #byPhase = new Map<PluginCatalogKind<TCatalog>, CampaignPlugin[]>();
  readonly #events: CampaignRegistryEvent[] = [];
  readonly #runtime: CampaignRegistryRuntime;
  readonly #sessionId: CampaignSessionId;
  #disposed = false;

  public constructor(tenantId: TenantId, catalog: NoInfer<TCatalog>) {
    this.#tenantId = tenantId;
    this.#runtime = {
      tenantId,
      startedAt: new Date().toISOString(),
      pluginRunCount: 0,
    };
    this.#sessionId = createCampaignSessionId(tenantId, createCampaignId(tenantId, 'catalog-session'));
    this.#index(catalog);
  }

  public register<TPlugin extends TCatalog[number]>(plugin: TPlugin): TPlugin {
    const bucket = this.#byPhase.get(plugin.kind) ?? [];
    this.#byPhase.set(plugin.kind, [...bucket, plugin]);

    this.#events.push({
      tenantId: this.#tenantId,
      campaignId: this.#sessionId,
      pluginId: plugin.pluginId,
      kind: plugin.kind,
      at: new Date().toISOString(),
      status: 'queued',
      name: buildEventName(this.#tenantId, this.#sessionId, plugin.phase),
    });

    return plugin;
  }

  public manifest(): CampaignManifest {
    const entries = [...this.#byPhase.entries()];
    const mapped = iteratorFrom?.(entries)
      ? iteratorFrom(entries)
          .map(([kind, plugins]) => [manifestKeys(kind), [...plugins]] as const)
          .toArray()
      : entries.map(([kind, plugins]) => [manifestKeys(kind), [...plugins]] as const);

    return Object.fromEntries(
      mapped.map(([key, plugins]) => [key, plugins.map((plugin) => plugin.pluginId)]),
    ) as unknown as CampaignManifest;
  }

  public async run<TKind extends PluginCatalogKind<TCatalog>>(
    kind: TKind,
    input: PluginInputOf<TCatalog, TKind>,
    context: {
      readonly tenantId: TenantId;
      readonly sessionId: CampaignSessionId;
      readonly route: readonly string[];
      readonly routeTags: readonly string[];
      readonly requestedBy: string;
    },
    requestId: string,
  ): Promise<PluginOutputOf<TCatalog, TKind>> {
    const candidates = this.#byPhase.get(kind) ?? [];
    if (candidates.length === 0) {
      throw new Error(`No plugin catalog for kind ${String(kind)} in request ${requestId}`);
    }

    const candidate = candidates[0] as CampaignPlugin;
    const stack = new AsyncDisposableStack();

    try {
      await using _scope = stack.use(new CampaignScope(this.#runtime));

      this.#events.push({
        tenantId: context.tenantId,
        campaignId: context.sessionId,
        pluginId: candidate.pluginId,
        kind,
        at: new Date().toISOString(),
        status: 'running',
        name: buildEventName(context.tenantId, context.sessionId, candidate.phase),
      });

      const output = (await candidate.run(input as never, context as never)) as PluginOutputOf<TCatalog, TKind>;

      this.#runtime.pluginRunCount += 1;
      this.#events.push({
        tenantId: context.tenantId,
        campaignId: context.sessionId,
        pluginId: candidate.pluginId,
        kind,
        at: new Date().toISOString(),
        status: 'completed',
        name: buildEventName(context.tenantId, context.sessionId, candidate.phase),
      });

      return output;
    } catch (error) {
      this.#events.push({
        tenantId: context.tenantId,
        campaignId: context.sessionId,
        pluginId: candidate.pluginId,
        kind,
        at: new Date().toISOString(),
        status: 'failed',
        name: buildEventName(context.tenantId, context.sessionId, candidate.phase),
      });
      throw error;
    } finally {
      await stack.disposeAsync();
    }
  }

  public telemetry(kind?: PluginCatalogKind<TCatalog>): readonly CampaignRegistryEvent[] {
    return kind ? this.#events.filter((event) => event.kind === kind) : [...this.#events];
  }

  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#byPhase.clear();
    this.#events.length = 0;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#byPhase.clear();
    this.#events.length = 0;
  }

  #index(catalog: readonly CampaignPlugin[]): void {
    const entries = iteratorFrom?.(catalog)
      ? iteratorFrom(catalog).map((plugin) => ({ kind: plugin.kind, plugin })).toArray()
      : catalog.map((plugin) => ({ kind: plugin.kind, plugin }));

    for (const entry of entries) {
      const current = this.#byPhase.get(entry.kind as PluginCatalogKind<TCatalog>) ?? [];
      this.#byPhase.set(entry.kind as PluginCatalogKind<TCatalog>, [...current, entry.plugin]);
    }
  }
}

export const buildCampaignRegistry = <TCatalog extends readonly CampaignPlugin[]>(
  tenantId: TenantId,
  catalog: NoInfer<TCatalog>,
): CampaignPluginRegistry<TCatalog> => {
  return new CampaignPluginRegistry(tenantId, catalog);
};
