export interface IO<A> { readonly run: () => A; }

export const of = <A>(value: A): IO<A> => ({ run: () => value });

export const map = <A, B>(fa: IO<A>, f: (a: A) => B): IO<B> => ({ run: () => f(fa.run()) });

export const flatMap = <A, B>(fa: IO<A>, f: (a: A) => IO<B>): IO<B> => ({ run: () => f(fa.run()).run() });

export interface State<S, A> {
  readonly run: (state: S) => [A, S];
}

export const stateOf = <S, A>(value: A): State<S, A> => ({ run: (state) => [value, state] });

export const stateMap = <S, A, B>(fa: State<S, A>, f: (value: A, state: S) => B): State<S, B> => ({
  run: (state) => {
    const [value, next] = fa.run(state);
    return [f(value, next), next];
  },
});

export const stateChain = <S, A, B>(fa: State<S, A>, f: (a: A) => State<S, B>): State<S, B> => ({
  run: (state) => {
    const [value, next] = fa.run(state);
    return f(value).run(next);
  },
});

export function runAll<S>(states: readonly State<S, unknown>[], seed: S): readonly [unknown, S][] {
  let current = seed;
  const out: Array<[unknown, S]> = [];
  for (const state of states) {
    const pair = state.run(current);
    out.push(pair);
    current = pair[1];
  }
  return out;
}
