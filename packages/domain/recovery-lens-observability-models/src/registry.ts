import type { LensPlugin } from './plugins';
import { type ObserverNamespace, observerNamespace } from './contracts';
import { type Brand, type Prettify } from '@shared/type-level';

export type RegistryMode = 'strict' | 'best-effort';
export type RegistryBrand = Brand<string, 'LensRegistry'>;

export interface RegistryEnvelope<TPayload> {
  readonly namespace: ObserverNamespace;
  readonly mode: RegistryMode;
  readonly payload: TPayload;
  readonly at: string;
}

export const createEnvelope = <TPayload>(namespace: string, mode: RegistryMode, payload: TPayload): RegistryEnvelope<TPayload> => ({
  namespace: observerNamespace(namespace),
  mode,
  payload,
  at: new Date().toISOString(),
});

export class LensRegistry<TEntries extends readonly LensPlugin[]> {
  readonly #entries: TEntries;
  readonly #mode: RegistryMode;

  public constructor(entries: TEntries, mode: RegistryMode = 'best-effort') {
    this.#entries = entries;
    this.#mode = mode;
  }

  public entries(): readonly Readonly<{ readonly name: string; readonly weight: number }>[] {
    return this.#entries.map((entry) => ({ name: entry.name, weight: entry.weight }));
  }

  public withMode(mode: RegistryMode): LensRegistry<TEntries> {
    return new LensRegistry(this.#entries, mode);
  }

  public route<TName extends TEntries[number]['name']>(name: TName): TEntries[number]['name'][] {
    return this.#entries
      .filter((entry) => entry.name === name)
      .map((entry) => entry.name as TEntries[number]['name']);
  }

  public diagnostics(): Prettify<{ readonly mode: RegistryMode; readonly count: number; readonly key: RegistryBrand }> {
    return {
      mode: this.#mode,
      count: this.#entries.length,
      key: `lens-registry:${this.#entries.length}` as RegistryBrand,
    };
  }
}

export const reducePlugins = <TEntries extends readonly LensPlugin[], TSeed>(
  entries: TEntries,
  seed: TSeed,
  reducer: (seed: TSeed, plugin: TEntries[number]) => TSeed,
): TSeed => {
  let output = seed;
  for (const entry of entries) {
    output = reducer(output, entry);
  }
  return output;
};
