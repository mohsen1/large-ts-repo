import {
  PluginLattice,
  PluginName,
  PluginNode,
  PluginResult,
  PluginSlot,
  PluginStage,
  PluginEnvelope,
  normalizePluginNode,
} from './plugin-lattice';
import type { NoInfer } from './tuple-utils';

export type RegistryScope<TInput> = {
  readonly input: TInput;
  readonly startedAt?: string;
  readonly route: `scope:${string}`;
};

export type RegistryItem<TInput = unknown, TOutput = unknown, TName extends PluginName = PluginName> = {
  readonly name: TName;
  readonly enabled: boolean;
  readonly tags: readonly (`tag:${string}` | `class:${string}`)[];
  readonly run: (input: RegistryContext<TName>, context: RegistryContext<TName>) => Promise<RegistryResult<TOutput>>;
  readonly weight: number;
};

export type RegistryContext<TName extends PluginName = PluginName> = RegistryScope<unknown> & {
  readonly plugin: TName;
  readonly slot: PluginSlot;
  readonly stage: PluginStage;
  readonly node: TName;
  readonly startedAt: string;
  readonly seed: unknown;
  readonly dependencies: Readonly<Record<string, unknown>>;
};

export type RegistryResult<TOutput> =
  | { readonly ok: true; readonly output: TOutput; readonly artifacts: readonly string[] }
  | { readonly ok: false; readonly error: Error; readonly artifacts: readonly string[] };

export type PluginMap<TItem extends readonly RegistryItem[]> = {
  [TEntry in TItem[number] as TEntry['name']]: TEntry;
};

export type EnabledNames<TItem extends readonly RegistryItem[]> = {
  [TEntry in TItem[number] as TEntry['name']]: TEntry extends { readonly enabled: true } ? TEntry['name'] : never;
}[TItem[number]['name']];

export type PluginResultFor<TItem extends readonly RegistryItem[], TName extends PluginName> =
  Extract<TItem[number], { name: TName }> extends infer TMatch extends RegistryItem<any, any, TName>
    ? TMatch extends RegistryItem<any, infer TOutput, TName>
      ? TOutput
      : never
    : never;

export type RegistryEvent<TNames extends PluginName> = {
  readonly id: `event:${TNames & string}`;
  readonly payload: {
    readonly name: TNames;
    readonly at: string;
  };
};

export type EventBucket<TNames extends PluginName> = {
  [K in `event:${TNames & string}`]: RegistryEvent<TNames>;
};

const asEvent = <TName extends PluginName>(name: TName): RegistryEvent<TName> => ({
  id: `event:${String(name).replace('plugin:', '')}` as `event:${TName & string}`,
  payload: {
    name,
    at: new Date().toISOString(),
  },
});

const isEnabled = (item: RegistryItem): item is RegistryItem & { enabled: true } => item.enabled;

const toContext = <TInput, TName extends PluginName>(
  scope: RegistryScope<TInput>,
  envelope: PluginEnvelope<TInput, TName>,
): RegistryContext<TName> => {
  const node = envelope.name as TName;
  return {
    input: envelope.input,
    startedAt: scope.startedAt ?? new Date().toISOString(),
    route: scope.route,
    plugin: node,
    slot: 'slot:registry' as PluginSlot,
    stage: 'stage:registry' as PluginStage,
    node,
    seed: envelope.seed,
    dependencies: envelope.dependencies,
  };
};

export class TypedRegistry<TInput, TItems extends readonly RegistryItem<TInput, unknown, PluginName>[]> {
  readonly #scope: RegistryScope<TInput>;
  readonly #lattice: PluginLattice<TInput, PluginNode<TInput, unknown, PluginName>[]>;
  readonly #items: readonly RegistryItem<TInput, unknown, PluginName>[];

  public constructor(items: TItems, scope: RegistryScope<TInput>) {
    this.#scope = scope;
    this.#items = [...items];
    this.#lattice = new PluginLattice(
      this.#items.filter(isEnabled).map((item) => {
        const node = normalizePluginNode({
          name: item.name,
          slot: 'slot:typed-registry',
          stage: 'stage:registry',
          weight: item.weight,
          dependsOn: [],
          run: async (input) => {
            const context = toContext(this.#scope, input);
            const result = await item.run(context, context);
            if (!result.ok) {
              return {
                status: 'err',
                error: result.error,
                logs: ['registry-failed', String(item.name)],
              } as const;
            }
            return {
              status: 'ok',
              output: result.output,
              logs: ['registry-success', ...result.artifacts],
            } as PluginResult<unknown>;
          },
        });
        return node as PluginNode<TInput, unknown, PluginName>;
      }) as PluginNode<TInput, unknown, PluginName>[],
      'stage:registry',
    );
  }

  public list(): readonly TItems[number]['name'][] {
    return this.#items.map((item) => item.name) as readonly TItems[number]['name'][];
  }

  public names(): readonly PluginName[] {
    return this.#lattice.names();
  }

  public async run<TName extends TItems[number]['name']>(
    name: TName,
    seed: NoInfer<TInput>,
  ): Promise<PluginResultFor<TItems, TName>> {
    const output = await this.#lattice.execute(name, {
      ...seed,
    } as TInput);
    return output as PluginResultFor<TItems, TName>;
  }

  public async runAll(seed: NoInfer<TInput>): Promise<EventBucket<TItems[number]['name']>> {
    const outputs = await this.#lattice.executeAll(seed);
    const outputEntries = outputs
      .map((entry, index) => asEvent(this.#lattice.names()[index] as TItems[number]['name']))
      .reduce((map, current) => {
        const next = { ...map };
        next[current.id] = { ...current, payload: { ...current.payload } };
        return next;
      }, Object.create(null) as EventBucket<TItems[number]['name']>);

    return outputEntries;
  }

  public diagnostics(): {
    readonly count: number;
    readonly enabled: readonly PluginName[];
    readonly tags: readonly string[];
  } {
    const enabled = this.#items.filter((entry) => entry.enabled).map((entry) => entry.name);
    const tags = [...new Set(this.#items.flatMap((entry) => entry.tags))];
    return {
      count: this.#items.length,
      enabled,
      tags,
    };
  }
}

export const selectByTag = <TItems extends readonly RegistryItem[], TFilter extends string>(
  items: TItems,
  predicate: (tag: string) => tag is TFilter,
): readonly TItems[number][] => {
  return items.filter((item) => item.tags.some((tag) => tag.startsWith('tag:') && predicate(tag.replace('tag:', ''))));
};

export const collectEvents = <TItems extends readonly RegistryItem[]>(
  items: TItems,
): Array<RegistryEvent<TItems[number]['name'] & PluginName>> => {
  return items.map((item) => asEvent(item.name as TItems[number]['name'] & PluginName));
};

export const eventBuckets = <TItems extends readonly RegistryItem[]>(
  values: readonly RegistryEvent<TItems[number]['name'] & PluginName>[],
): ReadonlyMap<`event:${string}`, RegistryEvent<TItems[number]['name'] & PluginName>> => {
  const map = new Map<`event:${string}`, RegistryEvent<TItems[number]['name'] & PluginName>>();
  for (const value of values) {
    map.set(value.id, value);
  }
  return map;
};

export const createRegistryScope = <TInput>(input: TInput): RegistryScope<TInput> => ({
  input,
  startedAt: new Date().toISOString(),
  route: `scope:${String(Date.now())}` as const,
});

export const normalizeItem = <TInput, TOutput, TName extends PluginName>(
  item: RegistryItem<TInput, TOutput, TName>,
): RegistryItem<TInput, TOutput, TName> => ({
  ...item,
  enabled: Boolean(item.enabled),
  weight: Math.max(0, Math.floor(item.weight)),
}) as RegistryItem<TInput, TOutput, TName>;
