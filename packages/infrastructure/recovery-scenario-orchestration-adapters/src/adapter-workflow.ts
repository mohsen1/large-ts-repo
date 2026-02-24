import type {
  AdapterManifest,
  AdapterRecord,
  AdapterRegistry,
} from './adapter-registry.js';
import { createAdapterRegistry } from './adapter-registry.js';
import { RecursivePath } from '@shared/type-level';
import type {
  PluginContract,
  PluginConfig,
  PluginStage,
  JsonLike,
  HorizonSignal,
  TimeMs,
} from '@domain/recovery-horizon-engine';
import { horizonBrand } from '@domain/recovery-horizon-engine';

export type WorkflowMode = 'single' | 'multi' | 'canary';

export interface WorkflowBinding<TKind extends PluginStage, TPayload = JsonLike> {
  readonly stage: TKind;
  readonly registry: AdapterRegistry<TKind, TPayload>;
  readonly manifest: AdapterManifest<TKind, TPayload>;
  readonly contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>;
  readonly selected: boolean;
}

export interface WorkflowReport<TKind extends PluginStage, TPayload = JsonLike> {
  readonly tenantId: string;
  readonly mode: WorkflowMode;
  readonly bindings: readonly WorkflowBinding<TKind, TPayload>[];
  readonly events: readonly string[];
  readonly emitted: number;
  readonly startedAt: TimeMs;
  readonly finishedAt: TimeMs;
}

type WorkflowSignalIterator<T> = AsyncGenerator<T>;

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

const asIterable = async function* <T>(values: readonly T[]): WorkflowSignalIterator<T> {
  for (const value of values) {
    await Promise.resolve();
    yield value;
  }
};

const asAsyncIterable = async function* <T>(values: readonly T[]): WorkflowSignalIterator<T> {
  for (const value of values) {
    await Promise.resolve();
    yield value;
  }
};

const buildBinding = async <
  TKind extends PluginStage,
  TPayload extends JsonLike,
>(
  tenantId: string,
  contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>,
): Promise<WorkflowBinding<TKind, TPayload>> => {
  const registry = await createAdapterRegistry<TKind, TPayload>(tenantId, [contract]);
  const manifest = registry.resolve(tenantId, contract.kind)[0];
  if (!manifest) {
    await registry[Symbol.asyncDispose]();
    throw new Error(`missing manifest for ${contract.id}`);
  }

  return {
    stage: contract.kind,
    registry,
    manifest: manifest.manifest,
    contract,
    selected: true,
  };
};

const eventsFromBindings = <TKind extends PluginStage, TPayload>(
  bindings: readonly WorkflowBinding<TKind, TPayload>[],
): readonly string[] =>
  bindings.map((entry) => `${entry.stage}:${entry.selected ? 'on' : 'off'}`);

const routeFromStage = <TKind extends PluginStage>(stage: TKind): RecursivePath<{ key: string; tenantId: string; contract: string }> =>
  `runtime.route.${stage}` as RecursivePath<{ key: string; tenantId: string; contract: string }>;

export const runWorkflow = async <
  TKind extends PluginStage,
  TPayload extends JsonLike,
>(
  tenantId: string,
  mode: WorkflowMode,
  contracts: readonly PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>[],
  signals: readonly HorizonSignal<TKind, TPayload>[],
): Promise<WorkflowReport<TKind, TPayload>> => {
  const startedAt = now();
  const registry = await createAdapterRegistry<TKind, TPayload>(tenantId, contracts);
  const bindings: WorkflowBinding<TKind, TPayload>[] = [];

  for (const contract of contracts) {
    bindings.push(await buildBinding(tenantId, contract));
  }

  const eventBuffer: string[] = [];
  for await (const entry of asIterable(bindings)) {
    eventBuffer.push(entry.stage);
  }

  const emittedList: HorizonSignal<TKind, TPayload>[] = [];
  if (mode === 'single') {
    const first = bindings[0];
    if (first) {
      for await (const signal of asAsyncIterable(signals)) {
        const output = await first.manifest.run(signal as HorizonSignal<TKind, JsonLike>, new AbortController().signal) as readonly HorizonSignal<TKind, TPayload>[];
        emittedList.push(...output);
        eventBuffer.push(`${first.contract.id}:${output.length}`);
      }
    }
  } else {
    for await (const signal of asAsyncIterable(signals)) {
      for (const binding of bindings) {
        if (binding.stage !== signal.kind) {
          continue;
        }
        const output = await binding.manifest.run(signal as HorizonSignal<TKind, JsonLike>, new AbortController().signal) as readonly HorizonSignal<TKind, TPayload>[];
        emittedList.push(...output);
        eventBuffer.push(`${binding.contract.id}:${output.length}`);
      }
    }
  }

  await registry[Symbol.asyncDispose]();
  for (const binding of bindings) {
    await binding.registry[Symbol.asyncDispose]();
  }

  return {
    tenantId,
    mode,
    bindings: bindings as readonly WorkflowBinding<TKind, TPayload>[],
    events: [...eventBuffer, ...eventsFromBindings(bindings)],
    emitted: emittedList.length,
    startedAt,
    finishedAt: now(),
  };
};

export const executeWithRegistry = async <
  TKind extends PluginStage,
  TPayload extends JsonLike,
>(
  tenantId: string,
  contracts: readonly PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>[],
  signal: HorizonSignal<TKind, TPayload>,
): Promise<readonly HorizonSignal<TKind, TPayload>[]> => {
  const registry = await createAdapterRegistry<TKind, TPayload>(tenantId, contracts);
  const outputs: HorizonSignal<TKind, TPayload>[] = [];
  const route = routeFromStage(signal.kind);

  for await (const bindingRecord of registry.scanStages(signal.kind)) {
    await bindingRecord.manifest.install(tenantId, bindingRecord.contract.defaults);
    const output = await bindingRecord.manifest.run(signal as HorizonSignal<TKind, JsonLike>, new AbortController().signal) as readonly HorizonSignal<TKind, TPayload>[];
    outputs.push(...output);
    eventHint([route]);
    eventHint([...bindingRecord.manifest.tags, route]);
  }

  await registry[Symbol.asyncDispose]();
  return outputs;
};

const eventHint = (events: readonly string[]): void => {
  void events.length;
};

export class WorkflowManager {
  #registry: AdapterRegistry<PluginStage, JsonLike>;
  #tenantId: string;
  #mode: WorkflowMode;
  #contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[];

  constructor(
    tenantId: string,
    mode: WorkflowMode,
    contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
    registry: AdapterRegistry<PluginStage, JsonLike>,
  ) {
    this.#tenantId = tenantId;
    this.#mode = mode;
    this.#contracts = contracts;
    this.#registry = registry;
  }

  get mode(): WorkflowMode {
    return this.#mode;
  }

  async bootstrap(): Promise<number> {
    let count = 0;

    for (const contract of this.#contracts) {
      const entries = this.#registry.resolve(this.#tenantId, contract.kind).length;
      if (entries === 0) {
        const installed = await this.#registry.install(this.#tenantId, contract.kind, {
          key: `${contract.kind}:${contract.id}` as any,
          kind: contract.kind,
          tags: ['managed', this.#tenantId],
          route: `runtime.bootstrap` as RecursivePath<{ key: string; tenantId: string; contract: string }>,
          install: async () => [],
          run: async (signal) => [signal],
          remove: async () => [],
        });
        if (installed) {
          count += 1;
        }
      } else {
        count += entries;
      }
    }

    return count;
  }

  async run<TPayload extends JsonLike>(
    signal: HorizonSignal<PluginStage, TPayload>,
  ): Promise<readonly HorizonSignal<PluginStage, TPayload>[]> {
    return executeWithRegistry<PluginStage, TPayload>(
      this.#tenantId,
      this.#contracts as readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
      signal,
    );
  }
}

export const createWorkflowManager = async <
  TKind extends PluginStage,
  TPayload extends JsonLike,
>(
  tenantId: string,
  mode: WorkflowMode,
  contracts: readonly PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>[],
): Promise<WorkflowManager> => {
  const registry = await createAdapterRegistry<TKind, TPayload>(tenantId, contracts);
  const manager = new WorkflowManager(
    tenantId,
    mode,
    contracts as unknown as readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
    registry as unknown as AdapterRegistry<PluginStage, JsonLike>,
  );
  await manager.bootstrap();
  return manager;
};
