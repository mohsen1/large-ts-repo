import type { AccessEventName, AccessEventOperation } from './language-types';

const accessorOperations = ['get', 'set'] as const satisfies readonly AccessEventOperation[];
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
  readonly #history: AccessEvent<'current', T>[] = [];
  readonly [historyKey] = this.#history;

  @trackedAccessor
  accessor current: T;

  constructor(initial: T) {
    this.current = initial;
  }

  history(): readonly AccessEvent<'current', T>[] {
    return this.#history;
  }

  @bound
  snapshot(): { readonly current: T; readonly history: readonly AccessEvent<'current', T>[] } {
    return {
      current: this.current,
      history: this.#history,
    };
  }
}
