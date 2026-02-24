import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type JsonLike,
  type PluginConfig,
  type PluginContract,
  type PluginHandle,
  type PluginStage,
  type HorizonSignal,
  type PluginCapability,
  type TimeMs,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import type { NoInfer, RecursivePath } from '@shared/type-level';

export type AdapterVerb = 'install' | 'remove' | 'execute' | 'resolve' | 'teardown';
export type AdapterTag<TStage extends PluginStage = PluginStage> = `${TStage}-adapter`;

export interface AdapterEvent<TStage extends PluginStage = PluginStage, TPayload = JsonLike> {
  readonly tenantId: string;
  readonly stage: TStage;
  readonly signalId: string;
  readonly contractId: string;
  readonly verb: AdapterVerb;
  readonly at: TimeMs;
  readonly payload: TPayload;
}

export interface AdapterEnvelope<TStage extends PluginStage = PluginStage, TPayload = JsonLike> {
  readonly contract: PluginContract<TStage, PluginConfig<TStage, JsonLike>, JsonLike>;
  readonly config: PluginConfig<TStage, JsonLike>;
  readonly events: readonly AdapterEvent<TStage, TPayload>[];
}

export type AdapterRegistryKey<TKind extends PluginStage = PluginStage> = `${TKind}:${string}`;

export interface AdapterManifest<TKind extends PluginStage = PluginStage, TPayload = JsonLike> {
  readonly key: AdapterRegistryKey<TKind>;
  readonly kind: TKind;
  readonly tags: readonly string[];
  readonly route: RecursivePath<{
    key: string;
    tenantId: string;
    contract: string;
  }>;
  install: (tenantId: string, config?: PluginConfig<TKind, JsonLike>) => Promise<readonly AdapterEvent<TKind, TPayload>[]>;
  run: (
    signal: HorizonSignal<TKind, JsonLike>,
    abortSignal: AbortSignal,
  ) => Promise<readonly HorizonSignal<TKind, JsonLike>[]>;
  remove: (tenantId: string, config?: PluginConfig<TKind, JsonLike>) => Promise<readonly AdapterEvent<TKind, TPayload>[]>;
}

export interface AdapterRecord<TKind extends PluginStage = PluginStage, TPayload = JsonLike> {
  readonly key: AdapterRegistryKey<TKind>;
  readonly manifest: AdapterManifest<TKind, TPayload>;
  readonly contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>;
  readonly installedAt: TimeMs;
  readonly removedAt?: TimeMs;
}

export interface AdapterRegistry<TKind extends PluginStage = PluginStage, TPayload = JsonLike> {
  install(tenantId: string, stage: TKind, manifest: AdapterManifest<TKind, TPayload>): Promise<boolean>;
  remove(tenantId: string, stage: TKind, key: AdapterRegistryKey<TKind>): Promise<boolean>;
  resolve(tenantId: string, stage: TKind): readonly AdapterRecord<TKind, TPayload>[];
  all(): readonly AdapterRecord<TKind, TPayload>[];
  eventLog(tenantId: string): readonly AdapterEvent<TKind, TPayload>[];
  snapshot(): Promise<readonly AdapterRecord<TKind, TPayload>[]>;
  scanStages(stage: TKind): AsyncGenerator<AdapterRecord<TKind, TPayload>>;
  [Symbol.asyncDispose](): Promise<void>;
  [Symbol.dispose](): void;
}

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

const asKindKey = <TKind extends PluginStage>(tenantId: string, key: AdapterRegistryKey<TKind>): string =>
  `${tenantId}:${key}`;

const routeLabel = <TKind extends PluginStage>(stage: TKind): AdapterTag<TKind> =>
  `${stage}-adapter` as AdapterTag<TKind>;

const toConfig = (
  kind: PluginStage,
  seed: string,
): PluginConfig<PluginStage, JsonLike> => ({
  pluginKind: kind,
  payload: {
    seed,
  },
  retryWindowMs: horizonBrand.fromTime(150),
});

export class InProcessAdapterRegistry<TKind extends PluginStage = PluginStage, TPayload = JsonLike> implements AdapterRegistry<TKind, TPayload> {
  readonly #records = new Map<string, AdapterRecord<TKind, TPayload>>();
  readonly #events = new Map<string, AdapterEvent<TKind, TPayload>[]>();
  readonly #stack: AsyncLocalStorage<string>;

  constructor() {
    this.#stack = new AsyncLocalStorage<string>();
  }

  [Symbol.dispose](): void {
    this.#records.clear();
    this.#events.clear();
    this.#stack.disable();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#records.clear();
    this.#events.clear();
    this.#stack.disable();
  }

  async install(tenantId: string, stage: TKind, manifest: AdapterManifest<TKind, TPayload>): Promise<boolean> {
    const key = asKindKey(tenantId, manifest.key);
    if (this.#records.has(key)) {
      return false;
    }

    const contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike> = {
      kind: stage,
      id: `${tenantId}:${manifest.key}` as PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>['id'],
      capabilities: [
        {
          key: stage,
          description: `adapter:${manifest.key}`,
          configSchema: { manifest: 'adapter' },
        },
      ] as PluginCapability<TKind>[],
      defaults: toConfig(stage, `stage:${tenantId}:${manifest.key}`) as PluginConfig<TKind, JsonLike>,
      execute: (async (input, abortSignal) => {
        const out: HorizonSignal<TKind, JsonLike>[] = [];
        const controller = abortSignal ?? new AbortController().signal;
        for (const entry of input) {
          if (controller.aborted) {
            break;
          }
          const output = await manifest.run(
            {
              id: horizonBrand.fromPlanId(`adapter:${tenantId}:${entry.pluginKind}:${now()}`),
              kind: entry.pluginKind,
              payload: entry.payload,
              input: {
                version: '1.0.0',
                runId: horizonBrand.fromRunId(`adapter:${tenantId}:${entry.pluginKind}`),
                tenantId,
                stage: entry.pluginKind,
                tags: [...manifest.tags, 'registry'],
                metadata: {
                  source: manifest.key,
                },
              },
              severity: 'low',
              startedAt: horizonBrand.fromDate(new Date(now()).toISOString()),
            },
            controller,
          );
          out.push(...output);
        }
        return out;
      }) as PluginHandle<TKind, JsonLike>,
    };

    const events = await manifest.install(tenantId, contract.defaults);
    const record: AdapterRecord<TKind, TPayload> = {
      key: manifest.key,
      manifest,
      contract,
      installedAt: now(),
    };

    this.#records.set(key, record);
    this.#events.set(key, [...(this.#events.get(key) ?? []), ...events]);
    return true;
  }

  async remove(tenantId: string, stage: TKind, key: AdapterRegistryKey<TKind>): Promise<boolean> {
    const stackKey = asKindKey(tenantId, key);
    const current = this.#records.get(stackKey);
    if (!current) {
      return false;
    }
    if (current.removedAt) {
      return false;
    }
    const removed = await current.manifest.remove(tenantId, current.contract.defaults);
    this.#events.set(stackKey, [...(this.#events.get(stackKey) ?? []), ...removed]);
    this.#records.set(stackKey, { ...current, removedAt: now() });
    return true;
  }

  resolve(tenantId: string, stage: TKind): readonly AdapterRecord<TKind, TPayload>[] {
    const prefix = `${tenantId}:`;
    return [...this.#records.entries()]
      .filter(([key, record]) => key.startsWith(prefix) && record.manifest.kind === stage && !record.removedAt)
      .map(([, record]) => record)
      .filter((record): record is AdapterRecord<TKind, TPayload> => record.manifest.kind === stage);
  }

  all(): readonly AdapterRecord<TKind, TPayload>[] {
    return [...this.#records.values()].filter((record) => !record.removedAt);
  }

  eventLog(tenantId: string): readonly AdapterEvent<TKind, TPayload>[] {
    const out: AdapterEvent<TKind, TPayload>[] = [];
    const prefix = `${tenantId}:`;
    for (const [recordKey, events] of this.#events.entries()) {
      if (recordKey.startsWith(prefix)) {
        out.push(...events);
      }
    }
    return out;
  }

  async snapshot(): Promise<readonly AdapterRecord<TKind, TPayload>[]> {
    return this.all();
  }

  async *scanStages(stage: TKind): AsyncGenerator<AdapterRecord<TKind, TPayload>> {
    const store = this.#stack.getStore();
    const previous = store ? `${store}->scan` : 'scan';
    this.#stack.enterWith(previous);

    const records = [...this.#records.values()].filter((entry) => entry.manifest.kind === stage && !entry.removedAt);
    for (const record of records) {
      await Promise.resolve();
      yield record;
    }
  }
}

export const composeAdapterKeys = <TKind extends PluginStage>(
  tenantId: string,
  stage: TKind,
  contracts: readonly PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>[],
): AdapterRegistryKey<TKind>[] =>
  contracts.map((entry) => `${tenantId}:${stage}:${entry.id}` as AdapterRegistryKey<TKind>);

export const createAdapterRegistry = async <
  TKind extends PluginStage,
  TPayload = JsonLike,
>(
  tenantId: string,
  contracts: NoInfer<readonly PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>[]>,
): Promise<InProcessAdapterRegistry<TKind, TPayload>> => {
  const registry = new InProcessAdapterRegistry<TKind, TPayload>();

  const adapterManifest = (
    contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>,
  ): AdapterManifest<TKind, TPayload> => ({
    key: `${contract.id}` as AdapterRegistryKey<TKind>,
    kind: contract.kind,
    tags: [routeLabel(contract.kind), `tenant:${tenantId}`],
    route: `manifest.${String(contract.kind)}` as RecursivePath<{ key: string; tenantId: string; contract: string }>,
    install: async () => [
      {
        tenantId,
        stage: contract.kind,
        signalId: `${contract.id}:installed`,
        contractId: contract.id,
        verb: 'install',
        at: now(),
        payload: { contract: contract.id, tenantId } as TPayload,
      },
    ],
    run: async (signal) => [
      {
        ...signal,
        kind: signal.kind,
        input: {
          ...signal.input,
          tags: [...signal.input.tags, 'registry'],
        },
      },
    ],
    remove: async () => [
      {
        tenantId,
        stage: contract.kind,
        signalId: `${contract.id}:removed`,
        contractId: contract.id,
        verb: 'remove',
        at: now(),
        payload: { contract: contract.id, tenantId, removed: true } as TPayload,
      },
    ],
  });

  for (const contract of contracts) {
    try {
      await registry.install(tenantId, contract.kind, adapterManifest(contract));
    } catch (error) {
      await registry[Symbol.asyncDispose]();
      throw error;
    }
  }
  return registry;
};

export const manifestFromContract = <
  TKind extends PluginStage,
  TPayload = JsonLike,
>(
  contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>,
): AdapterManifest<TKind, TPayload> => ({
  key: `${contract.id}` as AdapterRegistryKey<TKind>,
  kind: contract.kind,
  tags: ['contract', contract.kind],
  route: `contract.${String(contract.id)}` as RecursivePath<{ key: string; tenantId: string; contract: string }>,
  install: async () => [],
  run: async (signal) => [
    {
      ...signal,
      input: {
        ...signal.input,
        tags: [...signal.input.tags, 'from-contract'],
      },
    },
  ],
  remove: async () => [],
});
