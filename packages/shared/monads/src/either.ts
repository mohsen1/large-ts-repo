export type Unit = {};

export type Left<E> = { readonly _tag: 'Left'; readonly error: E };
export type Right<A> = { readonly _tag: 'Right'; readonly value: A };
export type Either<E, A> = Left<E> | Right<A>;

export const left = <E, A = never>(error: E): Either<E, A> => ({ _tag: 'Left', error });
export const right = <A, E = never>(value: A): Either<E, A> => ({ _tag: 'Right', value });

export const isLeft = <E, A>(fa: Either<E, A>): fa is Left<E> => fa._tag === 'Left';
export const isRight = <E, A>(fa: Either<E, A>): fa is Right<A> => fa._tag === 'Right';

export const map = <E, A, B>(fa: Either<E, A>, f: (a: A) => B): Either<E, B> => (isRight(fa) ? right(f(fa.value)) : fa);

export const mapLeft = <E, A, F>(fa: Either<E, A>, f: (e: E) => F): Either<F, A> => (isLeft(fa) ? left(f(fa.error)) : fa);

export const chain = <E, A, F, B>(fa: Either<E, A>, f: (a: A) => Either<F, B>): Either<E | F, B> =>
  isRight(fa) ? f(fa.value) : fa;

export const fold = <E, A, B>(fa: Either<E, A>, onLeft: (error: E) => B, onRight: (value: A) => B): B =>
  isLeft(fa) ? onLeft(fa.error) : onRight(fa.value);

export function all<E, A>(arr: readonly Either<E, A>[]): Either<E[], A[]> {
  const rights: A[] = [];
  const errs: E[] = [];
  for (const value of arr) {
    if (isLeft(value)) errs.push(value.error);
    else rights.push(value.value);
  }
  if (errs.length > 0) return left(errs);
  return right(rights);
}
