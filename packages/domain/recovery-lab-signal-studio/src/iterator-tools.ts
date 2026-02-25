export interface FlowState {
  readonly index: number;
  readonly label: string;
}

export type FlowMapper<TInput, TOutput> = (value: TInput, state: Readonly<FlowState>) => TOutput;
export type FlowPredicate<TInput> = (value: TInput, state: Readonly<FlowState>) => boolean;
export type FlowReducer<TInput, TOutput> = (accumulator: TOutput, value: TInput, state: Readonly<FlowState>) => TOutput;

export class FlowSequence<TInput> implements Iterable<TInput> {
  readonly #values: readonly TInput[];

  private constructor(values: Iterable<TInput>, private readonly label: string = 'flow-sequence') {
    this.#values = [...values];
  }

  public static from<TInput>(values: Iterable<TInput>, label = 'flow-sequence'): FlowSequence<TInput> {
    return new FlowSequence(values, label);
  }

  public static range(start: number, end: number): FlowSequence<number> {
    return FlowSequence.from(
      {
        *[Symbol.iterator]() {
          for (let value = start; value < end; value += 1) {
            yield value;
          }
        },
      },
      `range:${start}-${end}`,
    );
  }

  public [Symbol.iterator](): Iterator<TInput> {
    return this.#values[Symbol.iterator]();
  }

  public map<TOutput>(mapper: FlowMapper<TInput, TOutput>): FlowSequence<TOutput> {
    const mapped: TOutput[] = [];
    let index = 0;
    for (const item of this.#values) {
      mapped.push(mapper(item, { index, label: this.label }));
      index += 1;
    }
    return new FlowSequence(mapped, `${this.label}:map`);
  }

  public filter(predicate: FlowPredicate<TInput>): FlowSequence<TInput> {
    const filtered: TInput[] = [];
    let index = 0;
    for (const item of this.#values) {
      if (predicate(item, { index, label: this.label })) {
        filtered.push(item);
      }
      index += 1;
    }
    return new FlowSequence(filtered, `${this.label}:filter`);
  }

  public take(count: number): FlowSequence<TInput> {
    const limited = [...this.#values].slice(0, Math.max(0, count));
    return new FlowSequence(limited, `${this.label}:take:${count}`);
  }

  public skip(count: number): FlowSequence<TInput> {
    const sliced = [...this.#values].slice(Math.max(0, count));
    return new FlowSequence(sliced, `${this.label}:skip:${count}`);
  }

  public zip<TRight>(right: FlowSequence<TRight>): FlowSequence<[TInput, TRight]> {
    const zipped: Array<[TInput, TRight]> = [];
    const leftValues = [...this.#values];
    const rightValues = [...right];
    const length = Math.min(leftValues.length, rightValues.length);

    for (let index = 0; index < length; index += 1) {
      zipped.push([leftValues[index], rightValues[index]]);
    }

    return new FlowSequence(zipped, `${this.label}:zip:${right.label}`);
  }

  public split(size: number): FlowSequence<readonly TInput[]> {
    const chunks: Array<readonly TInput[]> = [];
    const safeSize = Math.max(1, Math.floor(size));
    for (let index = 0; index < this.#values.length; index += safeSize) {
      chunks.push(this.#values.slice(index, index + safeSize));
    }
    return new FlowSequence(chunks, `${this.label}:split:${safeSize}`);
  }

  public flatten<U>(flattened: (value: TInput) => readonly U[]): FlowSequence<U> {
    const output: U[] = [];
    for (const value of this.#values) {
      const nested = flattened(value);
      output.push(...nested);
    }
    return new FlowSequence(output, `${this.label}:flatten`);
  }

  public reduce<TOutput>(initial: TOutput, reducer: FlowReducer<TInput, TOutput>): TOutput {
    let index = 0;
    let accumulator = initial;
    for (const value of this.#values) {
      accumulator = reducer(accumulator, value, { index, label: this.label });
      index += 1;
    }
    return accumulator;
  }

  public toArray(): readonly TInput[] {
    return [...this.#values];
  }

  public toSorted(compare?: (left: TInput, right: TInput) => number): FlowSequence<TInput> {
    const sorted = [...this.#values].toSorted(compare);
    return new FlowSequence(sorted, `${this.label}:sorted`);
  }

  public count(): number {
    return this.#values.length;
  }

  public isEmpty(): boolean {
    return this.#values.length === 0;
  }

  public unique(selector: (value: TInput) => string): FlowSequence<TInput> {
    const seen = new Set<string>();
    const uniqueValues: TInput[] = [];
    for (const value of this.#values) {
      const token = selector(value);
      if (seen.has(token)) {
        continue;
      }
      seen.add(token);
      uniqueValues.push(value);
    }
    return new FlowSequence(uniqueValues, `${this.label}:unique`);
  }

  public entries(): FlowSequence<[number, TInput]> {
    const entries = this.#values.map((value, index) => [index, value] as [number, TInput]);
    return new FlowSequence(entries, `${this.label}:entries`);
  }
}

export const flow = <TInput>(value: Iterable<TInput>, label?: string): FlowSequence<TInput> =>
  FlowSequence.from(value, label);
