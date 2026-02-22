export type Middleware<TIn, TOut> = (input: TIn) => TOut;

export class Pipeline<T> {
  private readonly chain: Array<(value: any) => any> = [];

  use<TOut>(fn: Middleware<T, TOut>): Pipeline<TOut> {
    this.chain.push(fn);
    return this as unknown as Pipeline<TOut>;
  }

  run(value: T): any {
    return this.chain.reduce((current, fn) => fn(current), value);
  }
}

export const pipe = <T>(value: T, ...fns: Array<(value: T) => T>): T => fns.reduce((acc, fn) => fn(acc), value);

export const debounce = <T>(fn: (...args: T[]) => void, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};
