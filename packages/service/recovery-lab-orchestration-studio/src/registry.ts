import type { PluginCatalog, PluginContract, PluginSpec } from '@shared/lab-simulation-kernel';
import type { NoInfer } from '@shared/type-level';
import { createCatalog } from '@shared/lab-simulation-kernel';
import { ok, type Result, fail } from '@shared/result';

export interface RegistryEntry {
  readonly namespace: string;
  readonly active: boolean;
}

export interface StudioRegistry {
  readonly get: (name: string) => RegistryEntry | undefined;
  readonly list: () => readonly RegistryEntry[];
  readonly snapshot: () => string;
}

export const createStudioRegistry = <T extends PluginCatalog>(
  catalog: NoInfer<T>,
  namespace: string,
): StudioRegistry => {
  const source = createCatalog(catalog);
  const list: RegistryEntry[] = source.map((plugin: PluginContract) => ({
    namespace: `${namespace}:${plugin.name}`,
    active: true,
  }));

  return {
    get: (name) => list.find((entry) => entry.namespace === name),
    list: () => [...list],
    snapshot: () => JSON.stringify(list),
  };
};

export const ensureCatalog = <T extends PluginCatalog>(catalog: T): Result<T, Error> => {
  if (catalog.length <= 0) {
    return fail(new Error('catalog empty'));
  }
  return ok(catalog);
};

export const toSpec = <T extends string>(
  name: T,
  stage: PluginSpec<T>['stage'],
  weight: number,
): PluginSpec<T> => ({
  name,
  stage,
  version: '1.0',
  weight,
});
