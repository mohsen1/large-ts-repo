import type { BlueprintManifest } from '@domain/recovery-cascade-orchestration';
import { type CascadeBlueprint, type StageName, type StageContract, type PluginId } from '@domain/recovery-cascade-intelligence';

export interface AdapterContext {
  readonly id: PluginId;
  readonly startedAt: string;
  readonly metadata: Readonly<Record<string, string | number>>;
}

export type AdapterMode = 'raw' | 'transform' | 'trace' | 'guard';

export interface AdapterEvent {
  readonly kind: AdapterMode;
  readonly timestamp: string;
  readonly stage: StageName;
}

export interface RawBlueprintAdapter<TBlueprint extends CascadeBlueprint> {
  readonly kind: 'raw';
  readonly manifest: BlueprintManifest;
  readonly transform: (value: TBlueprint) => TBlueprint;
}

export interface TransformBlueprintAdapter<TValue extends object = object> {
  readonly kind: 'transform';
  readonly transform: (value: TValue) => TValue;
}

export interface GuardBlueprintAdapter<TValue extends object = object> {
  readonly kind: 'guard';
  readonly guard: (value: TValue) => value is TValue;
}

export interface TraceBlueprintAdapter {
  readonly kind: 'trace';
  readonly emit: (event: string) => void;
}

export type BlueprintAdapter =
  | RawBlueprintAdapter<CascadeBlueprint>
  | TransformBlueprintAdapter
  | GuardBlueprintAdapter
  | TraceBlueprintAdapter;

export interface StageAdapterRecord {
  readonly stage: StageName;
  readonly adapters: readonly BlueprintAdapter[];
}

export interface AdapterRegistry {
  readonly register: (adapter: BlueprintAdapter) => void;
  readonly all: () => readonly BlueprintAdapter[];
  readonly byKind: () => Readonly<Record<AdapterMode, readonly BlueprintAdapter[]>>;
}

interface MutableAdapterStore {
  readonly raw: Set<RawBlueprintAdapter<CascadeBlueprint>>;
  readonly transform: Set<TransformBlueprintAdapter>;
  readonly guard: Set<GuardBlueprintAdapter>;
  readonly trace: Set<TraceBlueprintAdapter>;
}

class RuntimeAdapterRegistry implements AdapterRegistry {
  readonly #store: MutableAdapterStore = {
    raw: new Set(),
    transform: new Set(),
    guard: new Set(),
    trace: new Set(),
  };

  public register(adapter: BlueprintAdapter): void {
    if (adapter.kind === 'raw') {
      this.#store.raw.add(adapter as RawBlueprintAdapter<CascadeBlueprint>);
      return;
    }
    if (adapter.kind === 'transform') {
      this.#store.transform.add(adapter as TransformBlueprintAdapter);
      return;
    }
    if (adapter.kind === 'guard') {
      this.#store.guard.add(adapter as GuardBlueprintAdapter);
      return;
    }
    this.#store.trace.add(adapter as TraceBlueprintAdapter);
  }

  public all(): readonly BlueprintAdapter[] {
    return [
      ...this.#store.raw,
      ...this.#store.transform,
      ...this.#store.guard,
      ...this.#store.trace,
    ];
  }

  public byKind(): Readonly<Record<AdapterMode, readonly BlueprintAdapter[]>> {
    return {
      raw: [...this.#store.raw],
      transform: [...this.#store.transform],
      guard: [...this.#store.guard],
      trace: [...this.#store.trace],
    };
  }
}

export const createAdapterRegistry = (): AdapterRegistry => new RuntimeAdapterRegistry();

export const applyBlueprintAdapters = async <TValue extends object>(
  value: TValue,
  adapters: readonly BlueprintAdapter[],
): Promise<TValue> => {
  let current: unknown = value;
  for (const adapter of adapters) {
    if (adapter.kind === 'trace') {
      adapter.emit(`adapter:${adapter.kind}`);
      continue;
    }
    if (adapter.kind === 'raw') {
      current = adapter.transform(current as CascadeBlueprint);
      continue;
    }
    if (adapter.kind === 'guard') {
      if (!adapter.guard(current as object)) {
        throw new Error(`adapter.guard.failed:${typeof current}`);
      }
      continue;
    }
    if (adapter.kind === 'transform') {
      current = adapter.transform(current as Record<string, unknown>);
      continue;
    }
  }
  return current as TValue;
};

export const mapStageAdapters = <TValue extends object>(
  stages: readonly StageContract[],
  adapters: readonly BlueprintAdapter[],
): readonly StageAdapterRecord[] => {
  const output: StageAdapterRecord[] = [];
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const selected = adapters.filter((_, adapterIndex) => adapterIndex % (stages.length || 1) === index % (stages.length || 1));
    output.push({
      stage: stage.name,
      adapters: selected,
    });
  }
  return output;
};

export const buildAdapterRegistry = (adapters: readonly BlueprintAdapter[]): AdapterRegistry => {
  const registry = createAdapterRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  return registry;
};

export const buildAdapterLog = (registry: AdapterRegistry): readonly string[] =>
  registry.all().map((adapter) => {
    if (adapter.kind === 'raw') return 'raw';
    if (adapter.kind === 'trace') return 'trace';
    return adapter.kind;
  });

const normalizeStages = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): readonly StageContract[] =>
  blueprint.stages.toSorted((left, right) => String(left.name).localeCompare(String(right.name)));

export const mapByKind = (adapters: readonly BlueprintAdapter[]): Readonly<Record<string, readonly BlueprintAdapter[]>> => {
  const output: Record<string, BlueprintAdapter[]> = {};
  for (const adapter of adapters) {
    const bucket = output[adapter.kind] ?? [];
    output[adapter.kind] = [...bucket, adapter];
  }
  return output;
};

export const normalizeAdapters = <TValue extends object>(
  adapters: readonly BlueprintAdapter[],
): readonly BlueprintAdapter[] => {
  const byKind = mapByKind(adapters);
  const order: AdapterMode[] = ['trace', 'guard', 'transform', 'raw'];
  const ordered: BlueprintAdapter[] = [];
  for (const kind of order) {
    const bucket = byKind[kind] ?? [];
    ordered.push(...bucket);
  }
  return ordered;
};

export const buildBootstrapAdapter = async (): Promise<BlueprintAdapter[]> => {
  const adapter: TraceBlueprintAdapter = { kind: 'trace', emit: (event) => void event };
  return [adapter];
};

export const stageToTag = (stage: StageContract): string => `stage:${stage.name}`;
export const listStageAdapters = (stages: readonly StageContract[]): readonly StageName[] => stages.map((stage) => stage.name);

export const bootstrapAdapters: Promise<readonly BlueprintAdapter[]> = (async () => {
  await Promise.resolve();
  return buildBootstrapAdapter();
})();

export const allBlueprintAdapters = async (): Promise<readonly BlueprintAdapter[]> => {
  const defaultAdapters = await bootstrapAdapters;
  return [
    ...defaultAdapters,
    {
      kind: 'guard',
      guard: (value): value is object => typeof value === 'object' && value != null,
    },
    {
      kind: 'transform',
      transform: (value: object) => value,
    },
  ];
};
