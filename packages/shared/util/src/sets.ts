export const unionAll = <T>(sets: Iterable<ReadonlySet<T>>): ReadonlySet<T> =>
  Iterator.from(sets).reduce((acc, set) => acc.union(set), new Set<T>());

export const intersectSets = <T>(left: Iterable<T>, right: Iterable<T>): ReadonlySet<T> =>
  new Set(left).intersection(new Set(right));

export const subtractSets = <T>(left: Iterable<T>, right: Iterable<T>): ReadonlySet<T> =>
  new Set(left).difference(new Set(right));

export const xorSets = <T>(left: Iterable<T>, right: Iterable<T>): ReadonlySet<T> =>
  new Set(left).symmetricDifference(new Set(right));

export const hasSameMembers = <T>(left: Iterable<T>, right: Iterable<T>): boolean =>
  xorSets(left, right).size === 0;

export const isSuperset = <T>(left: Iterable<T>, right: Iterable<T>): boolean =>
  new Set(left).isSupersetOf(new Set(right));
