import type { Brand, IsoTimestamp, RunId } from './types';
import { isoNow } from './types';

export interface WindowBucket<TPayload> {
  readonly start: IsoTimestamp;
  readonly end: IsoTimestamp;
  readonly items: readonly TPayload[];
  readonly count: number;
}

export const partitionByWindow = <TPayload extends { at: number }>(
  values: Iterable<TPayload>,
  windowMs: number,
): ReadonlyMap<number, WindowBucket<TPayload>> => {
  const buckets = new Map<number, TPayload[]>();
  for (const value of values) {
    const slot = Math.floor(value.at / windowMs) * windowMs;
    const bucket = buckets.get(slot) ?? [];
    bucket.push(value);
    buckets.set(slot, bucket);
  }

  const sorted = new Map<number, WindowBucket<TPayload>>();
  for (const slot of [...buckets.keys()].toSorted((left, right) => left - right)) {
    const entries = buckets.get(slot) ?? [];
    const start = new Date(slot).toISOString();
    const end = new Date(slot + windowMs).toISOString();
    const items = entries.toSorted((left, right) => left.at - right.at);
    sorted.set(slot, {
      start: start as IsoTimestamp,
      end: end as IsoTimestamp,
      items,
      count: items.length,
    });
  }

  return sorted;
};

export const toTuple = <TValues>(values: Iterable<TValues>): readonly [number, TValues] => {
  const valuesArray = [...values];
  const length = valuesArray.length;
  return [length, valuesArray[0] as TValues];
};

export const zipSorted = <TLeft, TRight>(
  left: Iterable<TLeft>,
  right: Iterable<TRight>,
  compare: (left: TLeft, right: TRight) => number,
): readonly [TLeft, TRight][] => {
  const toRight = (value: TLeft | TRight): TRight => value as unknown as TRight;
  const toLeft = (value: TLeft | TRight): TLeft => value as unknown as TLeft;
  const leftArray = [...left].toSorted((a, b) => compare(a, toRight(b)));
  const rightArray = [...right].toSorted((a, b) => compare(toLeft(a), b));
  const maxLength = Math.max(leftArray.length, rightArray.length);
  const out: Array<[TLeft, TRight]> = [];

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftArray[index];
    const rightValue = rightArray[index];
    if (leftValue === undefined || rightValue === undefined) {
      continue;
    }
    out.push([leftValue, rightValue]);
  }

  return out;
};

export const iteratorFrom = <TValue>(value: Iterable<TValue>): IterableIterator<TValue> => {
  const candidate = (globalThis as { readonly Iterator?: { from?: (iterable: Iterable<TValue>) => IterableIterator<TValue> } }).Iterator?.from;
  if (candidate) {
    return candidate(value);
  }

  return value[Symbol.iterator]() as IterableIterator<TValue>;
};

export const mapIterator = <TPayload, TOutput>(
  input: Iterable<TPayload>,
  transform: (value: TPayload) => TOutput,
): readonly TOutput[] => {
  const iterator = iteratorFrom(input);
  const output: TOutput[] = [];
  for (const item of iterator) {
    output.push(transform(item));
  }
  return output;
};

export const reduceIterator = <TPayload, TAggregate>(
  input: Iterable<TPayload>,
  seed: TAggregate,
  reducer: (acc: TAggregate, value: TPayload, index: number) => TAggregate,
): TAggregate => {
  let current = seed;
  let index = 0;
  for (const value of iteratorFrom(input)) {
    current = reducer(current, value, index);
    index += 1;
  }
  return current;
};

export const toEvents = <TPayload>(
  source: Iterable<TPayload>,
): IterableIterator<{
  readonly at: IsoTimestamp;
  readonly runId: Brand<string, 'RunId'>;
  readonly payload: TPayload;
}> => {
  const iterator = iteratorFrom(source);
  return (function* () {
    for (const item of iterator) {
      yield {
        at: isoNow(),
        runId: `run:${Math.random().toString(36).slice(2)}` as RunId,
        payload: item,
      };
    }
  })();
};

export const collectEvents = async <TPayload>(
  source: AsyncIterable<TPayload>,
): Promise<readonly TPayload[]> => {
  const values: TPayload[] = [];
  for await (const item of source) {
    values.push(item);
  }
  return values;
};
