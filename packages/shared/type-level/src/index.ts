export * from './patterns';
export * from './plugin-registry';
export * from './variadic-helpers';
export * from './async-disposable';
export * from './plugin-bridge';
export * from './mapped-recursion';
export * from './intersections';
export * from './route-templates';
export * from './solver-constraints';
export * from './stress-types';
export * from './stress-runtime';
export * as stressConditionalGraph from './stress-conditional-graph';
export * as stressHierarchy from './stress-hierarchy';
export * as stressIntersections from './stress-intersections';
export * as stressTemplateRoutes from './stress-template-routes';
export * as stressControlflow from './stress-controlflow';
export * as stressGenericSolver from './stress-generic-solver';
export * as stressTypeLabs from './stress-type-level-labs';
export * as stressClassChains from './stress-class-hierarchies';
export * as stressIntersectionLabs from './stress-intersection-labs';
export * as stressTemplateWorkflows from './stress-template-workflows';
export * as stressRecursionPipelines from './stress-recursion-pipelines';
export * as stressConditionalOrbit from './stress-conditional-orbit';
export * as stressHierarchyMatrix from './stress-hierarchy-matrix';
export * as stressIntersectionGrid from './stress-intersection-grid';
export * as stressMappedRecursionWorkbench from './stress-mapped-recursion-workbench';
export * as stressRecursiveCascade from './stress-recursive-cascade';
export * as stressConstraintSolverLab from './stress-constraint-solver-lab';
export * as stressBinaryChains from './stress-binary-chains';
export * as stressGenericInstantiationLab from './stress-generic-instantiation-lab';
export * as stressPatternLabs from './stress-pattern-labs';
export * as recursiveWorkbench from './recursive-workbench';
export * as routeCommandFabric from './route-command-fabric';
export * as solverOverloadLab from './solver-overload-lab';
export * as stressClassCascade from './class-chain-cascade';
export * from './stress-binary-chains';
export * from './stress-generic-instantiation-lab';
export type { OrbitDomain, OrbitAction, OrbitRoute, OrbitStatus, OrbitPhase, OrbitCommandPlan } from './stress-conditional-orbit';
export type { NestedMap } from './stress-mapped-recursion-workbench';

export {
  type RecoveryVerb,
  type RecoveryDomain,
  type RecoverySeverity,
  type RecoveryId,
  type RecoveryCommand,
  type StageTransition,
  type ParsedRecoveryCommand,
  type ResolveCommand,
  type StageChain,
  type CommandChain,
  type CommandProfile,
  type CatalogCommands,
  type CommandCatalog,
  type ResolveTuple,
  type ResolveUnion,
  type StageTransitionCatalog,
  type RouteConstraintSet,
  commandCatalog,
  type StageByActionOutput,
  type DecDepth,
  type FiniteDepth,
  parseRecoveryCommand,
  resolveRecoveryCommand,
  commandEnvelope,
  catalogProfile,
  routeConstraintSet,
} from './advanced-conditional';

export type Primitive = string | number | boolean | bigint | symbol | null | undefined;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface JsonArray extends Array<JsonValue> {}

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends Primitive
    ? T
    : T extends Array<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type Flatten<T> = T extends Array<infer U> ? U : T;
export type AwaitedLike<T> = T extends PromiseLike<infer U> ? AwaitedLike<U> : T;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type OmitNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

export type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

export type IsNever<T> = [T] extends [never] ? true : false;

export type IsAny<T> = 0 extends 1 & T ? true : false;

export type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false;

export type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

export type Merge<A, B> = Omit<A, keyof B> & B;

export type DeepMerge<A, B> =
  A extends Primitive[]
    ? [...A, ...(B extends Primitive[] ? B : [])]
    : A extends Primitive
      ? B
      : B extends Primitive
        ? B
        : {
            [K in keyof (A & B)]: K extends keyof B
              ? K extends keyof A
                ? DeepMerge<A[K], B[K]>
                : B[K]
              : K extends keyof A
                ? A[K]
                : never;
          };

export type MergeMap<A extends Record<string, unknown>, K extends keyof A> =
  { [P in keyof A]: { key: P; value: A[P] } }[K];

export type KeyPaths<T> = T extends Date | Primitive
  ? never
  : T extends Array<infer U>
    ? KeyPaths<U> extends never ? `[]` : `[]` | `[${number}]${KeyPaths<U> extends never ? '' : `.${KeyPaths<U>}`}`
    : { [K in keyof T & string]: T[K] extends Primitive
        ? K
        : T[K] extends Array<infer U>
          ? `${K}[]` | `${K}[${number}]${KeyPaths<U> extends never ? '' : `.${KeyPaths<U>}`}`
          : `${K}` | `${K}.${KeyPaths<T[K]>}`
      }[keyof T & string];

export type PathValue<T, P extends string> =
  P extends `${infer H}.${infer R}`
    ? H extends keyof T
      ? PathValue<T[H], R>
      : unknown
    : P extends keyof T
      ? T[P]
      : unknown;

export type PathTuple<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? [K, ...PathTuple<T[K]>]
        : [K];
    }[keyof T & string]
  : [];

export type Predicate<T> = (value: T) => value is T;

export type Guard<T, S extends T = T> = (value: T) => value is S;

export interface Cursor<T> {
  readonly value: T;
  readonly atEnd: boolean;
  moveNext(): this;
}

export type NonEmptyArray<T> = [T, ...T[]];

export type Optionalize<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] };

export interface AsyncTask<I, O> {
  id: Brand<string, 'EntityId'>;
  name: string;
  state: 'idle' | 'running' | 'complete' | 'errored' | 'cancelled';
  input: I;
  output?: O;
}

export interface GraphNode<I, O> {
  id: Brand<string, 'graph-node'>;
  label: string;
  requires: NonEmptyArray<Brand<string, 'graph-node'>>;
  run(input: I): Promise<O>;
}

export class Pipeline<I, O> {
  private readonly steps: Array<(input: any) => Promise<any>>;

  constructor(private readonly name: string, steps: Array<(input: any) => Promise<any>>) {
    this.steps = steps;
  }

  async execute(input: I): Promise<O> {
    let current: any = input;
    for (const step of this.steps) {
      current = await step(current);
    }
    return current as O;
  }

  getName(): string {
    return this.name;
  }
}

export type AsyncMapper<I, O> = (input: I) => Promise<O>;

export interface Foldable<T> {
  reduce<A>(seed: A, fn: (acc: A, value: T) => A): A;
}

export type AsyncReducer<T, A> = (acc: A, value: T, index: number) => Promise<A>;

export async function runPipeline<I, O>(
  name: string,
  steps: readonly AsyncMapper<any, any>[],
  input: I,
): Promise<O> {
  const pipeline = new Pipeline<I, O>(name, [...steps]);
  return pipeline.execute(input);
}

export function isResult<T, E>(value: { ok: boolean; value?: T; error?: E }): value is { ok: true; value: T } {
  return value.ok;
}

export function unwrapResult<T, E>(value: { ok: boolean; value?: T; error?: E }, fallback: (error: E) => T): T {
  return value.ok ? (value.value as T) : fallback((value.error as E));
}

export {
  type NoInferAdvanced,
  type Branded,
  type TokenizedTemplate,
  type SplitTemplate,
  type JoinTemplate,
  type SnakeToKebab,
  type NamespaceKey,
  type RemoveUndefined,
  type DeepStrip,
  type DeepStripTuple,
  type KeyRemapWithNamespace,
  type RecursiveTupleKeysUnique,
  type PrefixUnion,
  type RecursiveMerge,
  type MapObjectByValueType,
  type ValuesByKind,
  type FlattenDeep,
  type FlattenTuple,
  type VariadicMerge,
  type Head,
  type Tail,
  type PairwiseJoin,
  type TraceTag,
  type TraceRecord,
  type DisposableTraceHandle,
  type AsyncDisposableTraceHandle,
  tokenizeTemplate,
  toTokenizedTemplate,
  normalizeNamespace,
  uniqueByKey,
  chunkByKey,
  mapWithIteratorHelpers,
  mergeTuples,
  reverseFold,
  ensureIterable,
  zipIterables,
  collectToMap,
  cartesianMatrix,
  asDiscriminator,
  normalizeNamespaceBatch,
  mergeRecords,
  type PluginTraceLineage,
  linealize,
  toRecordString,
  fromIterable,
  mapByIndex,
} from './composition-labs';
