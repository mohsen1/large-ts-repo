import type { AccessEventName, AccessEventOperation } from './language-types';
import { 'access:get' as accessGet, 'access:set' as accessSet } from './module-tokens';

const historyKey: unique symbol = Symbol('observable-cell.history');

export type AccessEvent<Field extends string, Value> = {
  readonly name: AccessEventName<Field>;
  readonly value: Value;
  readonly at: number;
};

type Trackable<Field extends string, Value> = {
  readonly [historyKey]: AccessEvent<Field, Value>[];
};

export function bound<This, Args extends readonly unknown[], Return>(
  _target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
): void {
  if (context.private) {
    return;
  }

  context.addInitializer(function (this: This) {
    const key = context.name as keyof This;
    const value = this[key];
    if (typeof value === 'function') {
      Object.defineProperty(this, key, {
        configurable: true,
        writable: true,
        value: value.bind(this),
      });
    }
  });
}

export function trackedAccessor<Field extends string, Value, This extends Trackable<Field, Value>>(
  target: ClassAccessorDecoratorTarget<This, Value>,
  context: ClassAccessorDecoratorContext<This, Value>,
) {
  const accessorOperations = [accessGet, accessSet] as const satisfies readonly AccessEventOperation[];
  const name = String(context.name) as Field;
  return {
    get(this: This): Value {
      const value = target.get.call(this);
      this[historyKey].push({
        name: `${name}:${accessorOperations[0]}` as AccessEventName<Field>,
        value,
        at: Date.now(),
      });
      return value;
    },
    set(this: This, value: Value): void {
      target.set.call(this, value);
      this[historyKey].push({
        name: `${name}:${accessorOperations[1]}` as AccessEventName<Field>,
        value,
        at: Date.now(),
      });
    },
  };
}

export class ObservableCell<T> {
  static operations: readonly AccessEventOperation[];
  static eventNames: readonly AccessEventName<'current'>[];
  static accessor createdCount = 0;
  static accessor snapshotCount = 0;
  static accessor lastSnapshotAt: number | undefined;
  static #eventNameSet = new Set<AccessEventName<'current'>>();

  static {
    this.operations = [accessGet, accessSet];
    this.eventNames = this.operations.map((operation) => `current:${operation}` as AccessEventName<'current'>);
    this.#eventNameSet = new Set(this.eventNames);
  }

  readonly #history: AccessEvent<'current', T>[] = [];
  readonly [historyKey] = this.#history;

  @trackedAccessor
  accessor current: T;

  constructor(initial: T) {
    ObservableCell.createdCount += 1;
    this.current = initial;
  }

  history(): readonly AccessEvent<'current', T>[] {
    return this.#history;
  }

  static isObservableCell(value: unknown): value is ObservableCell<unknown> {
    return typeof value === 'object' && value !== null && #history in value;
  }

  static isEventName(value: string): value is AccessEventName<'current'> {
    return this.#eventNameSet.has(value as AccessEventName<'current'>);
  }

  @bound
  snapshot(): { readonly current: T; readonly history: readonly AccessEvent<'current', T>[] } {
    ObservableCell.snapshotCount += 1;
    ObservableCell.lastSnapshotAt = Date.now();
    return {
      current: this.current,
      history: this.#history,
    };
  }
}
