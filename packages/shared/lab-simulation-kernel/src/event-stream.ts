export interface TimelineEvent<TPayload = unknown> {
  readonly index: number;
  readonly timestamp: Date;
  readonly payload: TPayload;
}

export class TimelineIterator<T> implements Iterable<TimelineEvent<T>> {
  readonly #items: readonly T[];

  constructor(items: readonly T[]) {
    this.#items = items;
  }

  public *[Symbol.iterator](): Iterator<TimelineEvent<T>> {
    let index = 0;
    for (const item of this.#items) {
      yield {
        index,
        timestamp: new Date(Date.now() + index),
        payload: item,
      };
      index += 1;
    }
  }

  public map<U>(fn: (value: TimelineEvent<T>) => U): TimelineIterator<U> {
    return new TimelineIterator([...this].map((event) => fn(event)));
  }

  public filter(fn: (value: TimelineEvent<T>) => boolean): TimelineIterator<T> {
    return new TimelineIterator([...this].filter(fn).map((entry) => entry.payload));
  }

  public toArray(): TimelineEvent<T>[] {
    return [...this];
  }
}

export const createTimeline = <T>(values: readonly T[]): TimelineIterator<T> => {
  return new TimelineIterator(values);
};

export const collectWindow = <T>(iterator: Iterable<T>, size: number): T[][] => {
  const chunks: T[][] = [];
  let current: T[] = [];
  for (const value of iterator) {
    current.push(value);
    if (current.length >= size) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
};

export const toSummaryString = (iterator: Iterable<unknown>): string => {
  return [...iterator].map((value, index) => `${index}:${String(value)}`).join(' -> ');
};
