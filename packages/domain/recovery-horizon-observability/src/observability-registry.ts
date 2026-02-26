import { type Branded, type NoInferAdvanced } from '@shared/type-level';
import type { JsonLike, PluginStage } from '@domain/recovery-horizon-engine';
import type { ObservatoryStage } from './observability-identity';

export type PluginId = Branded<string, 'observability-plugin'>;
export type AdapterId<TKind extends ObservatoryStage> = Branded<`${TKind}:${string}`, 'observability-adapter'>;
export type RegistryScope = 'runtime' | 'design' | 'test';

export type PluginMetadata<TKind extends ObservatoryStage, TPayload> = {
  readonly id: PluginId;
  readonly stage: TKind;
  readonly kind: string;
  readonly enabled: boolean;
  readonly scope: RegistryScope;
  readonly payload: TPayload;
};

export type PluginAdapter<TKind extends ObservatoryStage = ObservatoryStage, TPayload = JsonLike> = (
  tenantId: string,
  signal: TPayload,
) => TPayload;

export type PluginDescriptor<
  TKind extends ObservatoryStage = ObservatoryStage,
  TPayload = JsonLike,
> = PluginMetadata<TKind, TPayload> & {
  readonly id: PluginId;
  readonly stage: TKind;
  readonly adapter: PluginAdapter<TKind, TPayload>;
};

export type RegistryEntries<T extends readonly PluginDescriptor[]> = {
  [K in T[number] as K['id']]: K;
};

export type StageScopedRecords<T extends readonly PluginDescriptor[]> = {
  [S in ObservatoryStage]: ReadonlyArray<Extract<T[number], { stage: S }>>;
};

export type RebindedAdapters<T extends Record<string, PluginDescriptor>> = {
  [K in keyof T]: (
    value: T[K] extends PluginDescriptor<any, infer TPayloadV>
      ? TPayloadV
      : never,
  ) => T[K] extends PluginDescriptor<infer TKind, infer TPayloadV>
      ? PluginDescriptor<TKind, TPayloadV>
      : never;
};

type RegistryMap = {
  [K: string]: PluginDescriptor;
};

type BakedRegistry<T extends readonly PluginDescriptor[]> = {
  [K in T[number] as K['id']]: K;
};

const validateScope = (scope: RegistryScope) => scope === 'runtime' || scope === 'design' || scope === 'test';

export class ObservatoryPluginRegistry<TDescriptors extends readonly PluginDescriptor[] = readonly PluginDescriptor[]> {
  #entries = new Map<string, PluginDescriptor>();
  readonly #scope = new Set<PluginDescriptor>();
  #typed: RegistryMap = {};
  readonly #bakedEntries: BakedRegistry<TDescriptors> = {} as BakedRegistry<TDescriptors>;

  constructor(private readonly scopeHint: RegistryScope = 'runtime') {
    if (!validateScope(this.scopeHint)) {
      this.scopeHint = 'runtime';
    }
  }

  register<TDescriptor extends PluginDescriptor>(
    descriptor: TDescriptor,
  ): ObservatoryPluginRegistry<[...TDescriptors, TDescriptor]> {
    const key = descriptor.id as string;
    this.#entries.set(key, descriptor);
    this.#bakedEntries[key as keyof BakedRegistry<TDescriptors>] = descriptor as unknown as BakedRegistry<TDescriptors>[keyof BakedRegistry<TDescriptors>];
    this.#scope.add(descriptor);
    return this as unknown as ObservatoryPluginRegistry<[...TDescriptors, TDescriptor]>;
  }

  snapshot<T extends readonly PluginDescriptor[] = TDescriptors>(): RegistryEntries<T> {
    return this.#bakedEntries as unknown as RegistryEntries<T>;
  }

  get<TId extends TDescriptors[number]['id']>(id: TId): TDescriptors[number] | undefined {
    return this.#entries.get(id as string) as TDescriptors[number] | undefined;
  }

  list<TKind extends ObservatoryStage = ObservatoryStage>(): ReadonlyArray<PluginDescriptor<TKind>> {
    return Array.from(this.#scope).filter((entry) => entry.stage === (entry.stage as PluginStage) as TKind) as
      unknown as ReadonlyArray<PluginDescriptor<TKind>>;
  }

  byStage<TKind extends ObservatoryStage>(stage: NoInferAdvanced<TKind>): ReadonlyArray<PluginDescriptor<TKind>> {
    return this.list<TKind>().filter((entry) => entry.stage === stage);
  }

  [Symbol.iterator](): Iterator<PluginDescriptor> {
    return this.#scope.values();
  }

  [Symbol.dispose](): void {
    this.#scope.clear();
    this.#entries.clear();
    this.#typed = {};
  }
}

export const createPluginAdapter = <
  TKind extends ObservatoryStage,
  TPayload,
>(
  id: PluginId,
  stage: TKind,
  payload: TPayload,
  adapter: PluginAdapter<TKind, TPayload>,
): PluginDescriptor<TKind, TPayload> => ({
  id,
  stage,
  kind: `adapter:${stage}`,
  enabled: true,
  scope: 'runtime',
  payload,
  adapter,
});

export const createStageBundle = <const T extends readonly PluginDescriptor[]>(
  stage: ObservatoryStage,
  descriptors: T,
): readonly PluginDescriptor[] =>
  descriptors
    .map((descriptor) => ({
      ...descriptor,
      stage,
    }))
    .filter((item) => item.stage === stage);

export const resolvePluginByStage = <
  T extends readonly PluginDescriptor[],
  TStage extends ObservatoryStage,
>(
  descriptors: T,
  stage: TStage,
): readonly Extract<T[number], { stage: TStage }>[] => {
  const out = descriptors.filter((entry) => entry.stage === stage);
  return out as unknown as readonly Extract<T[number], { stage: TStage }>[];
};
