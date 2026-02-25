import type { NoInfer } from './tuple-utils';
import { AsyncScopeFence } from './disposables';

export type PluginName = `plugin:${string}`;
export type PluginSlot = `slot:${string}`;
export type PluginStage = `stage:${string}`;
export type PluginDependency = `dep:${PluginName}`;

const asPluginName = <TName extends string>(value: TName): PluginName =>
  (String(value).startsWith('plugin:') ? (value as PluginName) : `plugin:${value}`) as PluginName;

const asDependency = (value: string): PluginDependency =>
  (String(value).startsWith('dep:') ? (value as PluginDependency) : `dep:${value}`) as PluginDependency;

const asSlot = (value: string): PluginSlot => `slot:${value}` as PluginSlot;
const asStage = (value: string): PluginStage => `stage:${value}` as PluginStage;

export interface PluginNode<TInput, TOutput, TName extends PluginName = PluginName> {
  readonly name: TName;
  readonly slot: PluginSlot;
  readonly stage: PluginStage;
  readonly dependsOn: readonly PluginDependency[];
  readonly weight: number;
  run(input: PluginEnvelope<TInput, TName>, context: PluginContext<TInput, TName>): Promise<PluginResult<TOutput>>;
}

export type PluginEnvelope<TInput, TName extends PluginName = PluginName> = {
  readonly input: NoInfer<TInput>;
  readonly name: TName;
  readonly seed: NoInfer<TInput>;
  readonly route: readonly PluginName[];
  readonly dependencies: Readonly<Record<string, unknown>>;
};

export type PluginContext<TInput, TName extends PluginName = PluginName> = {
  readonly executionId: string;
  readonly stage: PluginStage;
  readonly slot: PluginSlot;
  readonly node: TName;
  readonly at: string;
  readonly base: NoInfer<TInput>;
  readonly seed: NoInfer<TInput>;
};

export type PluginResult<TOutput> =
  | { readonly status: 'ok'; readonly output: TOutput; readonly logs: readonly string[] }
  | { readonly status: 'skip'; readonly reason: string; readonly logs: readonly string[] }
  | { readonly status: 'err'; readonly error: Error; readonly logs: readonly string[] };

export type StageSequence = readonly [PluginStage, ...PluginStage[]];

export type StageRoute<TSegments extends readonly PluginStage[]> = TSegments extends readonly [
  infer THead extends PluginStage,
  ...infer TRest extends readonly PluginStage[],
]
  ? TRest['length'] extends 0
    ? THead
    : `${THead}/${StageRoute<TRest>}`
  : never;

export type NodeOutputByName<
  TNodes extends readonly PluginNode<unknown, unknown, PluginName>[],
  TName extends PluginName,
> = Extract<TNodes[number], { name: TName }> extends PluginNode<unknown, infer TOutput, TName>
  ? TOutput
  : never;

export type NodeInputMap<TNodes extends readonly PluginNode<unknown, unknown, PluginName>[]> = {
  [TItem in TNodes[number] as TItem['name']]: TItem extends PluginNode<infer TInput, unknown, TItem['name']> ? TInput : never;
};

export type PluginEnvelopeMap<TInput, TNodes extends readonly PluginNode<TInput, unknown, PluginName>[]> = {
  [TItem in TNodes[number] as TItem['name']]: PluginEnvelope<TInput, TItem['name']>;
};

const normalizeWeight = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(1_000, Math.floor(value));
};

const asPluginDependencyTarget = (value: PluginDependency): PluginName => {
  const unwrapped = String(value).replace(/^dep:/, '');
  return asPluginName(unwrapped);
};

const detectCycles = (edges: ReadonlyMap<PluginName, readonly PluginName[]>): boolean => {
  const visiting = new Set<PluginName>();
  const visited = new Set<PluginName>();

  const walk = (name: PluginName): boolean => {
    if (visiting.has(name)) {
      return true;
    }
    if (visited.has(name)) {
      return false;
    }
    visiting.add(name);
    for (const next of edges.get(name) ?? []) {
      if (walk(next)) {
        return true;
      }
    }
    visiting.delete(name);
    visited.add(name);
    return false;
  };

  for (const name of edges.keys()) {
    if (walk(name)) {
      return true;
    }
  }
  return false;
};

export class PluginLattice<
  TInput,
  TNodes extends readonly PluginNode<TInput, unknown, PluginName>[],
> {
  readonly #nodes: TNodes;
  readonly #index = new Map<string, TNodes[number]>();

  public constructor(nodes: TNodes, private readonly fallbackStage: PluginStage = 'stage:bootstrap') {
    this.#nodes = nodes;
    for (const node of this.#nodes) {
      this.#index.set(node.name, node as TNodes[number]);
    }
  }

  public nodes(): TNodes {
    return this.#nodes;
  }

  public names(): readonly PluginName[] {
    return [...this.#nodes].map((node) => node.name);
  }

  public diagnostics(): ReadonlyArray<{ readonly name: PluginName; readonly stage: PluginStage; readonly slot: PluginSlot }> {
    return [...this.#nodes].map((node) => ({ name: node.name, stage: node.stage, slot: node.slot }));
  }

  public order(): readonly PluginName[] {
    const indegree = new Map<PluginName, number>();
    const outgoing = new Map<PluginName, PluginName[]>();
    const edges = new Map<PluginName, readonly PluginName[]>();

    for (const node of this.#nodes) {
      const dependencies = node.dependsOn.map((dependency) => asPluginDependencyTarget(dependency));
      indegree.set(node.name, dependencies.length);
      edges.set(node.name, dependencies);
      outgoing.set(node.name, []);
    }

    if (detectCycles(edges)) {
      throw new Error('plugin-lattice-cycle');
    }

    for (const [nodeName, dependsOn] of edges) {
      for (const dependency of dependsOn) {
        const nextList = outgoing.get(dependency) ?? [];
        nextList.push(nodeName);
        outgoing.set(dependency, nextList);
      }
    }

    const sorted = [...indegree.entries()]
      .filter((entry) => entry[1] === 0)
      .map(([entry]) => entry[0] as PluginName)
      .sort((left, right) => String(left).localeCompare(String(right)));

    const output: PluginName[] = [];
    while (sorted.length > 0) {
      const current = sorted.shift();
      if (!current) {
        continue;
      }
      output.push(current);

      for (const next of (outgoing.get(current) ?? []) as PluginName[]) {
        const nextValue = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextValue);
        if (nextValue <= 0) {
          sorted.push(next as PluginName);
        }
      }
    }

    if (output.length !== this.#nodes.length) {
      throw new Error('plugin-lattice-invalid-order');
    }

    return output;
  }

  public async execute<TName extends TNodes[number]['name']>(
    name: TName,
    input: NoInfer<TInput>,
  ): Promise<NodeOutputByName<TNodes, TName>> {
    const route = this.order();
    const executionId = `exec:${this.fallbackStage}:${Date.now()}`;
    const outputs = new Map<string, unknown>();
    const dependencyRecord: Record<string, unknown> = {};

    const stack = new AsyncScopeFence({ namespace: executionId, tags: ['typed-lattice'] }, async () => {
      outputs.clear();
      return undefined;
    });
    await using _scope = stack;

    let matched: unknown = undefined;
    for (const entry of route) {
      const node = this.#index.get(entry) as (PluginNode<TInput, unknown, PluginName> | undefined);
      if (!node) {
        continue;
      }

      const typedNode = node as PluginNode<TInput, unknown, TNodes[number]['name']>;
      const envelope: PluginEnvelope<TInput, typeof typedNode.name> = {
        input,
        name: typedNode.name as TName,
        seed: input,
        route,
        dependencies: dependencyRecord,
      };

      const runContext: PluginContext<TInput, typeof typedNode.name> = {
        executionId,
        stage: typedNode.stage,
        slot: typedNode.slot,
        node: typedNode.name,
        at: new Date().toISOString(),
        base: input,
        seed: input,
      };

      for (const [key, value] of outputs) {
        dependencyRecord[key] = value;
      }

      const result = await typedNode.run(envelope, runContext);
      if (result.status === 'err') {
        throw result.error;
      }
      if (result.status === 'ok') {
        outputs.set(entry, result.output);
        if (typedNode.name === name) {
          matched = result.output;
        }
      }
    }

    if (matched === undefined) {
      throw new Error(`plugin-not-found:${String(name)}`);
    }

    return matched as NodeOutputByName<TNodes, TName>;
  }

  public async executeAll(seed: NoInfer<TInput>): Promise<readonly unknown[]> {
    const output: unknown[] = [];
    const outputs = new Map<string, unknown>();
    const dependencyRecord: Record<string, unknown> = {};

    const stack = new AsyncScopeFence({ namespace: 'lattice:execute-all', tags: ['typed-lattice'] }, async () => {
      outputs.clear();
      return undefined;
    });
    await using _scope = stack;

    const ordered = this.order();
    for (const entry of ordered) {
      const node = this.#index.get(entry) as (PluginNode<TInput, unknown, PluginName> | undefined);
      if (!node) {
        continue;
      }

      for (const [key, value] of outputs) {
        dependencyRecord[key] = value;
      }

      const envelope: PluginEnvelope<TInput, typeof node.name> = {
        input: seed,
        name: node.name,
        seed,
        route: ordered,
        dependencies: dependencyRecord,
      };

      const result = await node.run(envelope, {
        executionId: `all:${Date.now()}`,
        stage: node.stage,
        slot: node.slot,
        node: node.name,
        at: new Date().toISOString(),
        base: seed,
        seed,
      });
      if (result.status === 'ok') {
        outputs.set(entry, result.output);
        output.push(result.output);
      }
    }

    return output;
  }
}

export const normalizePluginNode = <
  TInput,
  TOutput,
  TName extends PluginName,
>(
  input: {
    name: TName;
    slot: string;
    stage: string;
    dependsOn?: readonly string[];
    weight?: number;
    run: PluginNode<TInput, TOutput, TName>['run'];
  },
): PluginNode<TInput, TOutput, TName> => ({
  ...input,
  name: input.name as TName,
  slot: asSlot(input.slot),
  stage: asStage(input.stage),
  dependsOn: (input.dependsOn ?? []).map((value) => asDependency(value)),
  weight: normalizeWeight(input.weight ?? 0),
  run: input.run,
});

export const latticeNode = <
  TInput,
  TOutput,
  TName extends PluginName,
>(
  input: Parameters<typeof normalizePluginNode<TInput, TOutput, TName>>[0],
): PluginNode<TInput, TOutput, TName> => normalizePluginNode(input);

export const defineDependencyChain = <TValues extends readonly string[]>(...values: TValues): readonly PluginDependency[] =>
  values.map((value) => asDependency(value));

export const inferPluginRoute = (
  ...values: PluginName[]
): StageRoute<[PluginStage, ...PluginStage[]]> => {
  const route = values.map((value) => `stage:${String(value).slice(7)}` as PluginStage);
  if (route.length === 0) {
    return 'stage:bootstrap' as StageRoute<[PluginStage, ...PluginStage[]]>;
  }
  return route.join('/') as StageRoute<[PluginStage, ...PluginStage[]]>;
};

export const mapRoute = <TNodes extends readonly PluginNode<unknown, unknown, PluginName>[]>(
  nodes: TNodes,
): Record<PluginName, PluginSlot> => {
  const output = Object.create(null) as Record<PluginName, PluginSlot>;
  for (const node of nodes) {
    output[node.name] = node.slot;
  }
  return output;
};

export const zipWithNames = <TLeft extends readonly PluginName[], TRight extends readonly PluginName[]>(
  left: TLeft,
  right: TRight,
): ReadonlyArray<[TLeft[number], TRight[number]]> => {
  const output: Array<[TLeft[number], TRight[number]]> = [];
  const max = Math.min(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    output.push([left[index], right[index]]);
  }
  return output;
};

export const routeFromNames = <TNames extends readonly string[]>(names: TNames): StageRoute<[PluginStage, ...PluginStage[]]> => {
  const normalized = names
    .filter((value) => value.length > 0)
    .map((entry) => `stage:${entry}`)
    .join('/') as StageRoute<[PluginStage, ...PluginStage[]]>;
  return normalized;
};

export const collectBySlot = <TNodes extends readonly PluginNode<unknown, unknown, PluginName>[]>(
  nodes: TNodes,
): ReadonlyMap<PluginSlot, readonly PluginName[]> => {
  const buckets = new Map<PluginSlot, PluginName[]>();
  for (const node of nodes) {
    const bucket = buckets.get(node.slot) ?? [];
    bucket.push(node.name);
    buckets.set(node.slot, bucket);
  }
  return buckets;
};

export const makeNodeSignature = <TInput>(node: PluginNode<TInput, unknown, PluginName>): string => {
  return `${node.name}|${node.slot}|${node.stage}|${node.weight}`;
};

export const normalizeSeed = <TInput>(seed: TInput): TInput => ({ ...seed }) as TInput;

export const toNoInfer = <T>(value: T): NoInfer<T> => value as NoInfer<T>;
