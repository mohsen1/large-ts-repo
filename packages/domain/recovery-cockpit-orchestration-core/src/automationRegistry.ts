import { Brand, OmitNever, type NoInfer } from '@shared/type-level';
import {
  type AutomationBlueprint,
  type AutomationBlueprintStep,
  type AutomationStage,
  type PluginId,
  type PluginInputFromDescriptor,
  type PluginOutputFromDescriptor,
  type RecoveryCockpitPluginDescriptor,
} from './automationBlueprint';

export type PluginMap = Record<string, RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>;

export type PluginRecord<T extends PluginMap> = {
  readonly [K in keyof T]: T[K];
};

export type PluginInputs<T extends PluginMap> = {
  readonly [K in keyof T]: PluginInputFromDescriptor<T[K]>;
};

export type PluginOutputs<T extends PluginMap> = {
  readonly [K in keyof T]: PluginOutputFromDescriptor<T[K]>;
};

export type PluginOutputSnapshot<T extends PluginMap> = OmitNever<{
  [K in keyof T]: PluginOutputs<T>[K] | undefined;
}>;

export type PluginOutputState<T extends PluginMap> = {
  readonly stage: keyof T;
  readonly state: 'available' | 'missing';
};

export type PluginAdapter<TInput = unknown, TOutput = unknown, TContext = object> = {
  readonly pluginId: PluginId;
  readonly execute: (input: NoInfer<TInput>, context: TContext) => Promise<TOutput>;
};

export const asPluginMap = <T extends PluginMap>(catalog: T): PluginRecord<T> => catalog;

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      readonly from?: <T>(value: Iterable<T>) => { toArray(): T[] };
    };
  }).Iterator?.from;

const toArray = <T>(value: Iterable<T>): T[] => iteratorFrom?.(value)?.toArray() ?? [...value];

export type PluginInputTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail] ? [NoInfer<Head>, ...PluginInputTuple<Tail>] : [];

export const buildInputTuple = <T extends readonly unknown[]>(values: T): PluginInputTuple<T> =>
  values as unknown as PluginInputTuple<T>;

export class Registry<T extends PluginMap = PluginMap> {
  readonly #catalog: T;
  readonly #adapters: Map<string, PluginAdapter<unknown, unknown, object>>;

  constructor(catalog: T) {
    this.#catalog = catalog;
    this.#adapters = new Map<string, PluginAdapter<unknown, unknown, object>>();
  }

  pluginIds(): readonly (keyof T)[] {
    return Object.keys(this.#catalog) as readonly (keyof T)[];
  }

  pluginDescriptors(): ReadonlyArray<T[keyof T]> {
    return toArray(Object.values(this.#catalog)) as unknown as ReadonlyArray<T[keyof T]>;
  }

  register<K extends keyof T>(key: K, adapter: PluginAdapter<PluginInputFromDescriptor<T[K]>, PluginOutputFromDescriptor<T[K]>, { tenant: string }>) {
    this.#adapters.set(String(key), adapter as PluginAdapter<unknown, unknown, object>);
  }

  hasAdapter(key: keyof T): boolean {
    return this.#adapters.has(String(key));
  }

  getAdapter<K extends keyof T>(key: K): PluginAdapter<PluginInputFromDescriptor<T[K]>, PluginOutputFromDescriptor<T[K]>, { tenant: string }> | undefined {
    return this.#adapters.get(String(key)) as PluginAdapter<
      PluginInputFromDescriptor<T[K]>,
      PluginOutputFromDescriptor<T[K]>,
      { tenant: string }
    > | undefined;
  }

  snapshot(): PluginOutputSnapshot<T> {
    const output: Record<string, PluginOutputs<T>[string] | undefined> = {};
    for (const key of this.pluginIds()) {
      output[String(key)] = this.hasAdapter(key) ? undefined : undefined;
    }
    return output as PluginOutputSnapshot<T>;
  }

  summarize(steps: readonly AutomationBlueprintStep<T[keyof T]>[]): ReadonlyArray<PluginOutputState<T>> {
    const byStep = new Set(toArray(steps).map((step) => String(step.plugin.pluginId)));
    return toArray(this.pluginIds()).map((key) => ({
      stage: key,
      state: byStep.has(String(this.#catalog[key].pluginId)) ? 'available' : 'missing',
    }));
  }
}

export const summarizeBlueprint = <T extends PluginMap>(blueprint: AutomationBlueprint<T[keyof T]>): string => {
  const counts = new Map<AutomationStage, number>([
    ['discover', 0],
    ['compose', 0],
    ['execute', 0],
    ['verify', 0],
    ['audit', 0],
  ]);

  for (const step of blueprint.steps) {
    const current = counts.get(step.plugin.stage) ?? 0;
    counts.set(step.plugin.stage, current + 1);
  }

  return `${blueprint.header.blueprintId} -> ${[...counts.entries()].map(([stage, count]) => `${stage}:${count}`).join(',')}`;
};

export type RunManifest = {
  readonly tenant: Brand<string, 'Tenant'>;
  readonly pluginCount: number;
  readonly createdAt: string;
  readonly policyHash: Brand<string, 'Hash'>;
};

export const buildManifest = (tenant: Brand<string, 'Tenant'>, blueprint: { readonly steps: readonly unknown[] }): RunManifest => ({
  tenant,
  pluginCount: blueprint.steps.length,
  createdAt: new Date().toISOString(),
  policyHash: `${tenant}:${blueprint.steps.length}` as Brand<string, 'Hash'>,
});

export const withRegistry = async <T extends PluginMap, TReturn>(
  catalog: T,
  callback: (registry: Registry<T>) => Promise<TReturn>,
): Promise<TReturn> => {
  const registry = new Registry(catalog);
  return callback(registry);
};
