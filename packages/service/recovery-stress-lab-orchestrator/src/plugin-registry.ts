import { err, ok, type Result } from '@shared/result';
import {
  type AdapterDefinition,
  type AdapterOutput,
  type PluginAdapterRegistry,
  type PluginManifest,
  type PluginManifestId,
  type PluginKind,
  type PluginRoute,
  type RegistryMode,
  createRegistry,
  PluginTopologySpec,
  buildTopologySpec,
  walkTopology,
  type AdapterContext,
} from '@domain/recovery-incident-lab-core';
import { RecoveryPluginRegistryStore, type PluginRegistryRecord } from '@data/recovery-horizon-store';

export type PluginRunRequest<TInput = unknown> = {
  readonly manifest: PluginManifest;
  readonly input: TInput;
  readonly route: PluginRoute;
  readonly mode: RegistryMode;
};

export interface PluginOrchestrationRegistryOptions {
  readonly tenantId: string;
  readonly namespace: string;
}

export interface PluginRegistryFacadeState {
  readonly tenantId: string;
  readonly registryId: string;
  readonly adapterCount: number;
  readonly manifestCount: number;
}

export interface PluginRegistrySnapshot {
  readonly registryId: string;
  readonly records: number;
  readonly timeline: readonly string[];
  readonly topology: {
    readonly namespace: string;
    readonly edges: number;
  };
}

const toArray = async <T>(values: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const value of values) {
    collected.push(value);
  }
  return collected;
};

export class PluginRegistryService {
  readonly #tenantId: string;
  readonly #namespace: string;
  readonly #store: RecoveryPluginRegistryStore;
  readonly #adapterRegistry: PluginAdapterRegistry;
  readonly #state: Map<PluginManifestId, PluginManifest>;
  readonly #adaptersByKind = new Map<PluginKind, AdapterDefinition<PluginKind, unknown, unknown>>();
  readonly #stack: AsyncDisposableStack;

  constructor(
    options: PluginOrchestrationRegistryOptions,
    store: RecoveryPluginRegistryStore = new RecoveryPluginRegistryStore(),
  ) {
    this.#tenantId = options.tenantId;
    this.#namespace = options.namespace;
    this.#store = store;
    this.#adapterRegistry = createRegistry(`${options.tenantId}:${options.namespace}`);
    this.#state = new Map();
    this.#stack = new AsyncDisposableStack();
    this.#stack.defer(() => {
      this.#state.clear();
    });
  }

  get state(): PluginRegistryFacadeState {
    return {
      tenantId: this.#tenantId,
      registryId: `${this.#tenantId}:${this.#namespace}`,
      adapterCount: this.#adapterRegistry.listSlots().length,
      manifestCount: this.#state.size,
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#stack.disposeAsync();
  }

  registerAdapter<TKind extends PluginKind, TInput = unknown, TOutput = unknown>(
    adapter: AdapterDefinition<TKind, TInput, TOutput>,
  ): Result<void> {
    try {
      this.#adapterRegistry.register(adapter);
      this.#adaptersByKind.set(adapter.manifest.kind, adapter as AdapterDefinition<PluginKind, unknown, unknown>);
      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }

  async seedManifests(manifests: readonly PluginManifest[]): Promise<Result<PluginRegistrySnapshot>> {
    const stack = new AsyncDisposableStack();
    const specs: PluginTopologySpec[] = [];
    const topologyStack: string[] = [];

    try {
      for (const manifest of manifests) {
        await this.#store.upsert({
          manifestId: manifest.id,
          manifest,
          installedAt: new Date().toISOString(),
          touchedAt: new Date().toISOString(),
        });
        this.#state.set(manifest.id, manifest);

        const localSpec = buildTopologySpec(this.#tenantId, [manifest]);
        specs.push(localSpec);
        topologyStack.push(localSpec.namespace);
      }

      stack.defer(() => {
        this.#state.clear();
        topologyStack.length = 0;
        specs.length = 0;
      });

      const topology = walkTopology(await this.toTopology());
      return ok({
        registryId: `${this.#tenantId}:${this.#namespace}`,
        records: this.#state.size,
        timeline: topology.map((entry) => `${entry.id}`),
        topology: {
          namespace: this.#namespace,
          edges: topology.length,
        },
      });
    } catch (error) {
      return err(error as Error);
    } finally {
      await stack.disposeAsync();
    }
  }

  async listManifests(kind?: PluginKind): Promise<readonly PluginManifest[]> {
    const payload = await this.#store.list(kind ? { kinds: [kind] } : {});
    if (!payload.ok) {
      return [];
    }

    return payload.value.map((entry) => entry.manifest);
  }

  async toTopology(): Promise<PluginTopologySpec> {
    const records = await this.#store.list();
    if (!records.ok) {
      return {
        namespace: this.#namespace,
        nodes: [],
        edges: [],
      };
    }

    const manifests = records.value.map((entry) => entry.manifest);
    return buildTopologySpec(this.#namespace, manifests);
  }

  async execute<TInput, TOutput>(
    request: PluginRunRequest<TInput>,
    context: {
      readonly runId: string;
      readonly mode: RegistryMode;
      readonly tenant: string;
    },
  ): Promise<Result<{
    readonly manifest: PluginManifest;
    readonly outcome: AdapterOutput<TOutput>;
    readonly adapterCount: number;
  }>> {
    const runScope = new AsyncDisposableStack();
    try {
      const candidate = this.#state.get(request.manifest.id);
      if (!candidate) {
        return err(new Error(`manifest not found: ${request.manifest.id}`));
      }

      const snapshot = await toArray(this.#store.events());
      runScope.defer(() => {
        const _snapshot = snapshot.length;
        void _snapshot;
      });

      const adapter = this.#adaptersByKind.get(candidate.kind);
      if (!adapter) {
        return err(new Error(`no adapter for kind: ${request.manifest.kind}`));
      }

      const executionContext: AdapterContext = {
        tenantId: context.tenant,
        namespace: this.#namespace,
        route: request.route,
        mode: request.mode,
        startedAt: new Date().toISOString(),
      };

      const output = (await adapter.execute(executionContext, request.input)) as AdapterOutput<TOutput>;

      return ok({
        manifest: request.manifest,
        outcome: output,
        adapterCount: this.#adapterRegistry.listSlots().length,
      });
    } catch (error) {
      return err(error as Error);
    } finally {
      await runScope.disposeAsync();
    }
  }

  async seedFromStore(): Promise<Result<PluginRegistrySnapshot>> {
    const result = await this.listManifests();
    const specs = result.map((manifest) => buildTopologySpec(this.#tenantId, [manifest]));
    const edges = specs.reduce((acc, entry) => acc + entry.edges.length, 0);
    const topology = await this.toTopology();

    return ok({
      registryId: `${this.#tenantId}:${this.#namespace}`,
      records: this.#state.size,
      timeline: topology.nodes.map((entry) => `${entry.id}`),
      topology: {
        namespace: this.#namespace,
        edges,
      },
    });
  }
}
