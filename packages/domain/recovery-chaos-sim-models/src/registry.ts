import type { Brand } from '@shared/type-level';
import type { NoInfer } from '@shared/type-level';
import { type StageModel } from './scenario';
import { type ChaosSimNamespace, type ChaosSimulationId } from './identity';

export type RegistryId = Brand<string, 'ChaosSimRegistry'>;
export type PluginPriority = 0 | 1 | 2 | 3 | 4 | 5;

export interface RegistryEntry<TId extends string = string, TPayload = unknown, TOutput = unknown> {
  readonly id: TId;
  readonly pluginName: string;
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly payload: TPayload;
  readonly outputType: TOutput;
  readonly capabilities: readonly string[];
  readonly priority: PluginPriority;
}

export interface PluginExecutor<TPayload, TOutput> {
  readonly execute: (payload: TPayload, context: PluginExecutionContext) => Promise<TOutput>;
}

export interface PluginExecutionContext {
  readonly namespace: ChaosSimNamespace;
  readonly runId: string;
  readonly startedAt: number;
}

export type RegistryKey<TName extends string> = `registry:${TName}`;

export type PluginById<
  TItems extends readonly RegistryEntry<string, unknown, unknown>[]
> = {
  [K in TItems[number]['id'] as RegistryKey<K>]: Extract<TItems[number], { id: K }>;
};

export type PluginOutput<TItems extends readonly RegistryEntry<string, unknown, unknown>[], TId extends TItems[number]['id']> =
  Extract<TItems[number], { id: TId }>['outputType'];

export type PluginExecutorMap<TItems extends readonly RegistryEntry<string, unknown, unknown>[]> = {
  [K in TItems[number] as K['id']]: PluginExecutor<K['payload'], K['outputType']>;
};

export interface RegistryAdapter<TItems extends readonly RegistryEntry<string, unknown, unknown>[]> {
  readonly entries: PluginById<TItems>;
  readonly executors: Partial<PluginExecutorMap<TItems>>;
}

export type StageShape = StageModel<string, unknown, unknown>;

export class ChaosSimulationRegistry<TItems extends readonly RegistryEntry<string, unknown, unknown>[]> {
  readonly #items: Map<string, RegistryEntry<string, unknown, unknown>>;
  readonly #executors = new Map<string, PluginExecutor<unknown, unknown>>();

  constructor(private readonly namespace: ChaosSimNamespace) {
    this.#items = new Map();
  }

  register<TItem extends TItems[number]>(item: TItem, executor: PluginExecutor<TItem['payload'], TItem['outputType']>): void {
    this.#items.set(item.id, item);
    this.#executors.set(item.id, executor as PluginExecutor<unknown, unknown>);
  }

  get<TItemId extends TItems[number]['id'] & string>(id: TItemId):
    | {
        item: Extract<TItems[number], { id: TItemId }>;
        execute: PluginExecutor<PluginOutput<TItems, TItemId>, PluginOutput<TItems, TItemId> extends never ? never : PluginOutput<TItems, TItemId>>;
      }
    | undefined {
    const item = this.#items.get(id);
    if (!item) {
      return undefined;
    }
    const executor = this.#executors.get(id);
    if (!executor) {
      return undefined;
    }
    return {
      item: item as Extract<TItems[number], { id: TItemId }>,
      execute: executor as {
        execute: PluginExecutor<PluginOutput<TItems, TItemId>, PluginOutput<TItems, TItemId>>['execute'];
      }
    };
  }

  list<TName extends string>(prefix: NoInfer<TName>): readonly TItems[number]['id'][] {
    const keys = [...this.#items.keys()];
    return keys.filter((id) => id.startsWith(prefix)) as readonly TItems[number]['id'][];
  }

  snapshot(): ReadonlyArray<RegistryEntry<string, unknown, unknown>> {
    return [...this.#items.values()];
  }

  [Symbol.dispose](): void {
    this.#items.clear();
    this.#executors.clear();
  }
}

export interface RegistryFactoryOptions {
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly allowFallback: boolean;
}

export function createRegistry<TItems extends readonly RegistryEntry<string, unknown, unknown>[]>(
  options: RegistryFactoryOptions
): ChaosSimulationRegistry<TItems> {
  return new ChaosSimulationRegistry<TItems>(options.namespace);
}
