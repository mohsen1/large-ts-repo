import type { AnyMiddleware, PipeChain, PipeResult } from './language-types';

export type Middleware<TIn, TOut> = (input: TIn) => TOut;

export class Pipeline<TInput, TCurrent = TInput> {
  private readonly chain: AnyMiddleware[] = [];

  use<TNext>(fn: Middleware<NoInfer<TCurrent>, TNext>): Pipeline<TInput, TNext> {
    this.chain.push(fn as AnyMiddleware);
    return this as unknown as Pipeline<TInput, TNext>;
  }

  run(value: NoInfer<TInput>): TCurrent {
    let current: unknown = value;
    for (const fn of this.chain) {
      current = (fn as AnyMiddleware)(current);
    }
    return current as TCurrent;
  }
}

export const pipe = <TInput, const Fns extends readonly AnyMiddleware[]>(
  value: NoInfer<TInput>,
  ...fns: PipeChain<TInput, Fns>
): PipeResult<TInput, Fns> => {
  let current: unknown = value;
  for (const fn of fns) {
    current = (fn as AnyMiddleware)(current);
  }
  return current as PipeResult<TInput, Fns>;
};

export const compose = <TInput, const Fns extends readonly AnyMiddleware[]>(
  ...fns: PipeChain<TInput, Fns>
) => (value: NoInfer<TInput>): PipeResult<TInput, Fns> => pipe(value, ...fns);

export const debounce = <const TArgs extends readonly unknown[]>(fn: (...args: TArgs) => void, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: TArgs) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};
