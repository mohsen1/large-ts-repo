export type IteratorProjection<TSource, TResult> = (value: TSource, index: number) => TResult;

export interface IteratorView<T> extends Iterable<T> {
  readonly source: Iterable<T>;
}

export const asIteratorView = <T>(source: Iterable<T>): IteratorView<T> => ({
  source,
  [Symbol.iterator]: () => source[Symbol.iterator](),
});

export const mapIterator = <T, TResult>(
  source: Iterable<T>,
  mapper: IteratorProjection<T, TResult>,
): TResult[] => {
  const iterator = source[Symbol.iterator]();
  const items: TResult[] = [];
  let index = 0;
  while (true) {
    const result = iterator.next();
    if (result.done) {
      return items;
    }
    items.push(mapper(result.value, index));
    index += 1;
  }
};

export const filterIterator = <T>(
  source: Iterable<T>,
  predicate: (value: T, index: number) => boolean,
): T[] => {
  const iterator = source[Symbol.iterator]();
  const out: T[] = [];
  let index = 0;
  while (true) {
    const result = iterator.next();
    if (result.done) {
      return out;
    }
    if (predicate(result.value, index)) {
      out.push(result.value);
    }
    index += 1;
  }
};

export const zipIterator = <A, B>(left: Iterable<A>, right: Iterable<B>): [A, B][] => {
  const leftIter = left[Symbol.iterator]();
  const rightIter = right[Symbol.iterator]();
  const out: [A, B][] = [];
  while (true) {
    const l = leftIter.next();
    const r = rightIter.next();
    if (l.done || r.done) {
      break;
    }
    out.push([l.value, r.value]);
  }
  return out;
};

export const consumeIterator = <T>(source: Iterable<T>): T[] => {
  const iterator = source[Symbol.iterator]();
  const out: T[] = [];
  while (true) {
    const result = iterator.next();
    if (result.done) {
      break;
    }
    out.push(result.value);
  }
  return out;
};
