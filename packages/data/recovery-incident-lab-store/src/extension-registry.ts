import {
  type IncidentLabEnvelope,
  type IncidentLabRun,
  type IncidentLabSignal,
  type IncidentLabScenario,
} from '@domain/recovery-incident-lab-core';
import { createClock } from '@domain/recovery-incident-lab-core';
import {
  PluginRegistry,
  buildPluginDefinition,
  buildPluginVersion,
  canonicalizeNamespace,
  type PluginDefinition,
  type PluginContext,
  type PluginResult,
} from '@shared/stress-lab-runtime';
import {
  type StoreQueryOptions,
  type Paginated,
  type LabStoreResult,
  type LabStoreError,
} from './types';

export type ExtensionName = `extension:${string}`;

export interface TimelineEnvelopePayload {
  readonly envelope: IncidentLabEnvelope;
  readonly signature: string;
}

export interface ExtensionRegistryRow {
  readonly key: string;
  readonly tags: readonly string[];
  readonly installedAt: string;
}

interface ExtensionDefinition {
  readonly extension: ScenarioDataExtension;
  readonly tenantId: string;
  readonly config: {
    readonly bucketSize: number;
    readonly mode: 'replay' | 'live' | 'archive';
  };
}

export interface ScenarioDataExtension {
  readonly namespace: string;
  readonly labels: readonly string[];
  readonly installedBy: string;
  readonly extensionId: string;
}

export type ScenarioDataSink<T = unknown> = (event: T) => Promise<void>;
export interface ScenarioDataPlugin<TPayload = unknown> {
  readonly name: string;
  readonly key: ExtensionName;
  readonly run: (payload: TPayload, scope: string) => Promise<boolean>;
}

export type ScenarioEnvelopeEnvelope<TPayload> = {
  readonly [K in keyof TPayload as `ext:${Extract<K, string>}`]: TPayload[K];
};

export interface QueryWindow {
  readonly windowMs: number;
  readonly buckets: number;
}

export const extensionNamespace = canonicalizeNamespace('recovery:incident-lab:data');

const withError = (message: string): LabStoreResult<never> => ({
  ok: false,
  error: {
    code: 'io_error',
    message,
  } satisfies LabStoreError,
});

const ok = <T>(value: T): LabStoreResult<T> => ({ ok: true, value });

const parseExtensionKey = (tenant: string, name: string): ExtensionName => `${tenant}:${name}` as ExtensionName;

const buildRow = (plugin: ScenarioDataExtension, tags: readonly string[]): ExtensionRegistryRow => ({
  key: plugin.extensionId,
  tags,
  installedAt: createClock().now(),
});

export class ScenarioExtensionRegistry {
  readonly #rows = new Map<string, ExtensionDefinition>();

  register(extension: ScenarioDataExtension, tenantId: string, config: ExtensionDefinition['config']): void {
    const key = parseExtensionKey(tenantId, extension.extensionId);
    this.#rows.set(key, { extension, tenantId, config: { ...config } });
  }

  unregister(key: string): void {
    this.#rows.delete(key);
  }

  has(key: string): boolean {
    return this.#rows.has(key);
  }

  list(): readonly ExtensionRegistryRow[] {
    return [...this.#rows.values()].map((entry) => buildRow(entry.extension, [entry.extension.namespace, entry.config.mode]));
  }

  keys(): readonly string[] {
    return [...this.#rows.keys()];
  }

  get(key: string): ExtensionDefinition | undefined {
    return this.#rows.get(key);
  }
}

export const createScenarioDataPlugins = (): readonly ScenarioDataPlugin[] => [
  {
    name: 'scenario-streaming',
    key: parseExtensionKey('tenant', 'streaming'),
    run: async (_payload, scope): Promise<boolean> => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return scope.startsWith('tenant:');
    },
  },
  {
    name: 'scenario-archive',
    key: parseExtensionKey('tenant', 'archive'),
    run: async (_payload, scope): Promise<boolean> => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return scope.endsWith(':run');
    },
  },
] as const;

const baselinePlugins = createScenarioDataPlugins().map((entry) => entry.key);

export const emitTimelineEnvelope = (
  scenario: IncidentLabScenario,
  signal: IncidentLabSignal,
): IncidentLabEnvelope<TimelineEnvelopePayload> => ({
  id: `${scenario.id}:ext:${Date.now()}` as IncidentLabEnvelope['id'],
  labId: scenario.labId,
  scenarioId: scenario.id,
  payload: {
    envelope: {
      id: `${scenario.id}:base:${Date.now()}` as IncidentLabEnvelope['id'],
      labId: scenario.labId,
      scenarioId: scenario.id,
      payload: signal,
      createdAt: signal.at,
      origin: 'data-plugin',
    },
    signature: baselinePlugins.join('|'),
  },
  createdAt: new Date().toISOString(),
  origin: 'data-plugin',
});

export const summarizeDataExtensions = (registry: ScenarioExtensionRegistry): ReadonlyMap<string, number> => {
  const values = new Map<string, number>();
  for (const row of registry.list()) {
    values.set(row.installedAt, (values.get(row.installedAt) ?? 0) + 1);
    for (const tag of row.tags) {
      values.set(tag, (values.get(tag) ?? 0) + 1);
    }
  }
  return values;
};

export interface ExtensionQueryOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly includeArchive?: boolean;
}

export const paginatedExtensions = (
  registry: ScenarioExtensionRegistry,
  options: StoreQueryOptions = { limit: 25, offset: 0 },
): Paginated<ExtensionRegistryRow> => {
  const rows = registry.list();
  const start = options.offset;
  const end = start + options.limit;
  return {
    items: rows.slice(start, end),
    total: rows.length,
    ...(end < rows.length ? { nextOffset: String(end) } : {}),
  };
};

const metadataPlugin = buildPluginDefinition(extensionNamespace, 'stress-lab/runtime', {
  name: 'scenario-extension-metadata',
  version: buildPluginVersion(1, 0, 0),
  tags: ['metadata', 'extension'],
  dependencies: ['dep:recovery:incident-lab:data'] as const,
  pluginConfig: {
    enabled: true,
    profile: 'data',
  },
  run: async (_context: PluginContext<Record<string, unknown>>, payload: { readonly scope: string }) => {
    const summary = {
      scope: payload.scope,
      namespace: extensionNamespace,
      pluginCount: baselinePlugins.length,
      installedAt: createClock().now(),
    };

    return {
      ok: true,
      value: summary,
      generatedAt: createClock().now(),
    };
  },
});

export const buildDataRegistry = (): PluginRegistry => {
  const registry = PluginRegistry.create(extensionNamespace);
  registry.register(metadataPlugin);
  return registry;
};

export const runDataPlugins = async (scope: string, payload: { readonly run: IncidentLabRun; readonly registry: ScenarioExtensionRegistry }): Promise<ReadonlyArray<boolean>> => {
  const plugins = createScenarioDataPlugins();
  const pluginScope = scope;
  const sink = await Promise.all(
    plugins.map(async (plugin) => {
      const extensionId = `${plugin.key}#${pluginScope}`;
      const registryKey = parseExtensionKey(pluginScope, extensionId);
      if (!registryHas(payload.registry, registryKey)) {
        payload.registry.register(
          {
            extensionId,
            namespace: String(extensionNamespace),
            labels: [plugin.name, pluginScope],
            installedBy: pluginScope,
          },
          pluginScope,
          { bucketSize: 8, mode: plugin.name === 'scenario-streaming' ? 'live' : 'archive' },
        );
      }
      return plugin.run(payload.run, pluginScope);
    }),
  );

  return sink;
};

const registryHas = (registry: ScenarioExtensionRegistry, key: string): boolean => {
  return registry.has(key);
};
