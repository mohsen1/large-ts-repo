import type { IncidentSeverity, RecoverySignal } from './type-system';

export type IterablePair<TLeft, TRight> = readonly [TLeft, TRight];

export interface IteratorBatch<TItem> extends IterableIterator<TItem> {
  readonly label: string;
}

const normalizeIterableIterator = <TItem>(iterator: Iterator<TItem>): IterableIterator<TItem> => ({
  next: (value?: TItem): IteratorResult<TItem> => iterator.next(value as unknown as never),
  [Symbol.iterator](): IterableIterator<TItem> {
    return this;
  },
});

export const hasIteratorFrom = (): boolean => {
  const iterator = (globalThis as { Iterator?: { from?: <TItem>(value: Iterable<TItem>) => IterableIterator<TItem> } }).Iterator;
  return typeof iterator === 'object' && iterator !== null && typeof iterator.from === 'function';
};

export const iteratorFrom = <TItem>(values: Iterable<TItem>): IterableIterator<TItem> => {
  const iteratorType = (globalThis as { Iterator?: { from?: <T>(value: Iterable<T>) => Iterator<T> } }).Iterator;
  const resolved = iteratorType?.from?.(values);
  if (resolved) {
    const direct = resolved as IterableIterator<TItem>;
    return typeof direct[Symbol.iterator] === 'function' ? direct : normalizeIterableIterator(resolved as Iterator<TItem>);
  }
  return normalizeIterableIterator(values[Symbol.iterator]());
};

export const iteratorCapabilities = Promise.resolve({
  supported: hasIteratorFrom(),
});

export const supportsIteratorFrom = (): Promise<{ supported: boolean }> => iteratorCapabilities;

export const chainIterators = <TItem>(...sources: readonly Iterable<TItem>[]): IterableIterator<TItem> => {
  function* createChain(parts: readonly Iterable<TItem>[]): IterableIterator<TItem> {
    for (const part of parts) {
      for (const value of part) {
        yield value;
      }
    }
  }
  return createChain(sources);
};

export const mapIterable = <TItem, TMapped>(
  source: Iterable<TItem>,
  mapper: (item: TItem, index: number) => TMapped,
): IterableIterator<TMapped> => {
  function* createMap(items: Iterable<TItem>): IterableIterator<TMapped> {
    let index = 0;
    for (const item of items) {
      yield mapper(item, index);
      index += 1;
    }
  }
  return createMap(source);
};

export const chunkIterator = <TItem>(source: Iterable<TItem>, chunkSize: number): IterableIterator<readonly TItem[]> => {
  function* createChunks(items: Iterable<TItem>): IterableIterator<readonly TItem[]> {
    const chunks = Math.max(1, Math.trunc(chunkSize));
    const iterator = iteratorFrom(items);
    let bucket: TItem[] = [];
    for (const value of iterator) {
      bucket.push(value);
      if (bucket.length >= chunks) {
        yield bucket;
        bucket = [];
      }
    }
    if (bucket.length > 0) {
      yield bucket;
    }
  }
  return createChunks(source);
};

export const pairwiseIterator = <TItem>(source: Iterable<TItem>): IterableIterator<readonly [TItem, TItem]> => {
  function* createPairs(items: Iterable<TItem>): IterableIterator<readonly [TItem, TItem]> {
    const iterator = iteratorFrom(items);
    const first = iterator.next();
    if (first.done) {
      return;
    }
    let previous = first.value;
    while (true) {
      const next = iterator.next();
      if (next.done) {
        return;
      }
      yield [previous, next.value] as const;
      previous = next.value;
    }
  }
  return createPairs(source);
};

export const toArray = <TItem>(values: Iterable<TItem>): readonly TItem[] => [...values];

export const summarizeByIterator = <TItem, TKey extends string>(
  source: Iterable<TItem>,
  summarize: (item: TItem) => TKey,
): readonly IterablePair<TKey, number>[] => {
  const grouped = new Map<TKey, number>();
  for (const value of source) {
    const key = summarize(value);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [...grouped] as readonly [TKey, number][];
};

export const summarizeSignalsBySeverity = (signals: readonly RecoverySignal[]): readonly IterablePair<IncidentSeverity, number>[] =>
  summarizeByIterator(signals, (signal) => signal.severity);
