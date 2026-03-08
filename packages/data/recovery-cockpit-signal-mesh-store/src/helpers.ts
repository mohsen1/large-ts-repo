import type { MeshExecutionPhase, MeshPlan, MeshTopology, MeshRunId, MeshPlanId } from '@domain/recovery-cockpit-signal-mesh';

export const iteratorToArray = async <T>(iterator: AsyncIterable<T> | Iterable<T>): Promise<T[]> => {
  if (typeof (iterator as AsyncIterable<T>)[Symbol.asyncIterator] === 'function') {
    return Array.fromAsync(iterator as AsyncIterable<T>);
  }
  return Array.from(iterator as Iterable<T>);
};

export const toDictionary = <K extends string | number | symbol, V>(entries: readonly (readonly [K, V])[]): Record<K, V> =>
  Object.fromEntries(entries) as Record<K, V>;

export const mapIterator = function* <T, U>(iterable: Iterable<T>, mapper: (value: T) => U): Generator<U> {
  for (const item of iterable) {
    yield mapper(item);
  }
};

export const filterIterator = function* <T>(iterable: Iterable<T>, predicate: (value: T) => boolean): Generator<T> {
  for (const item of iterable) {
    if (predicate(item)) {
      yield item;
    }
  }
};

export const takeIterator = function* <T>(iterable: Iterable<T>, limit: number): Generator<T> {
  let index = 0;
  for (const item of iterable) {
    if (index >= limit) {
      break;
    }
    index += 1;
    yield item;
  }
};

export const withNamespace = (namespace: string, runId: MeshRunId): string => `${namespace}:${runId as string}`;

export const keyPhasePhase = (planId: MeshPlanId, phase: MeshExecutionPhase): `${MeshPlanId & string}:${MeshExecutionPhase}` =>
  `${planId as MeshPlanId & string}:${phase}`;

export const summarizeTopology = (topology: MeshTopology): string =>
  `${topology.nodes.length} nodes, ${topology.edges.length} edges for ${topology.tenant as string}`;

export const serializePlan = (plan: MeshPlan): string => JSON.stringify(plan);
