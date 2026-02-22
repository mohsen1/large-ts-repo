export type Either<L, R> = { kind: 'left'; left: L } | { kind: 'right'; right: R };

export const left = <L>(value: L): Either<L, never> => ({ kind: 'left', left: value });
export const right = <R>(value: R): Either<never, R> => ({ kind: 'right', right: value });

export const isLeft = <L, R>(value: Either<L, R>): value is { kind: 'left'; left: L } => value.kind === 'left';
export const isRight = <L, R>(value: Either<L, R>): value is { kind: 'right'; right: R } => value.kind === 'right';

export const mapLeft = <L, R, NL>(value: Either<L, R>, fn: (left: L) => NL): Either<NL, R> =>
  isLeft(value) ? { kind: 'left', left: fn(value.left) } : value;

export const mapRight = <L, R, NR>(value: Either<L, R>, fn: (right: R) => NR): Either<L, NR> =>
  isRight(value) ? { kind: 'right', right: fn(value.right) } : value;

export const flatMap = <L, R, NR>(value: Either<L, R>, fn: (right: R) => Either<L, NR>): Either<L, NR> =>
  isRight(value) ? fn(value.right) : value;

export const fold = <L, R, T>(value: Either<L, R>, onLeft: (left: L) => T, onRight: (right: R) => T): T =>
  isLeft(value) ? onLeft(value.left) : onRight(value.right);
