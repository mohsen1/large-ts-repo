import type { NoInfer } from '@shared/typed-orchestration-core';
import type { StageDefinition, StageName } from './contract';

export interface WorkflowEdge {
  readonly from: StageName;
  readonly to: StageName;
  readonly weightMs: number;
}

export interface WorkflowGraphConfig {
  readonly tenant: string;
  readonly namespace: string;
  readonly revision: string;
}

export interface StagePathContext {
  readonly startedBy: StageName;
  readonly requestedAt: string;
  readonly route: readonly StageName[];
}

export interface GraphPair<T extends readonly unknown[]> {
  readonly first: T[0];
  readonly second: T extends readonly [unknown, ...unknown[]] ? T[1] : never;
}

export interface PipelineIterator<T> {
  [Symbol.iterator](): Iterator<T>;
  next(): IteratorResult<T>;
  map<TMapped>(map: (value: T, index: number) => TMapped): PipelineIterator<TMapped>;
  filter<TPredicate extends T>(predicate: (value: T, index: number) => value is TPredicate): PipelineIterator<TPredicate>;
  toArray(): readonly T[];
  asTrace(): readonly string[];
}

export const createPipelineIterator = <T>(values: readonly T[]): PipelineIterator<T> => {
  const snapshot = [...values];
  let index = 0;
  const iterator: PipelineIterator<T> = {
    [Symbol.iterator](): Iterator<T> {
      return iterator;
    },
    next(): IteratorResult<T> {
      if (index >= snapshot.length) {
        return { done: true, value: undefined };
      }
      const value = snapshot[index] as T;
      index += 1;
      return { done: false, value };
    },
    map<TMapped>(mapper: (value: T, mapIndex: number) => TMapped): PipelineIterator<TMapped> {
      return createPipelineIterator(snapshot.map((value, mapIndex) => mapper(value, mapIndex)));
    },
    filter<TPredicate extends T>(
      predicate: (value: T, filterIndex: number) => value is TPredicate,
    ): PipelineIterator<TPredicate> {
      return createPipelineIterator(snapshot.filter((value, filterIndex) => predicate(value, filterIndex)) as TPredicate[]);
    },
    toArray: () => snapshot,
    asTrace: () => snapshot.map((value, itemIndex) => `${itemIndex}:${String(value)}`),
  };
  return iterator;
};

export class WorkflowGraph {
  readonly #forward: Map<StageName, readonly StageName[]>;
  readonly #reverse: Map<StageName, readonly StageName[]>;
  readonly #definitions: Map<StageName, StageDefinition>;
  readonly #config: WorkflowGraphConfig;

  public constructor(definitions: readonly StageDefinition[], config: WorkflowGraphConfig) {
    this.#config = config;
    this.#definitions = new Map(definitions.map((definition) => [definition.name, definition]));
    this.#forward = new Map();
    this.#reverse = new Map();

    for (const definition of definitions) {
      const target = [...definition.dependencies];
      this.#forward.set(definition.name, target);
      this.#reverse.set(definition.name, []);
    }
    for (const [from, targets] of this.#forward) {
      for (const to of targets) {
        const existing = this.#reverse.get(to) ?? [];
        this.#reverse.set(to, [...existing, from]);
      }
    }
  }

  public config(): WorkflowGraphConfig {
    return this.#config;
  }

  public hasNode(node: StageName): boolean {
    return this.#definitions.has(node);
  }

  public dependencies(node: StageName): readonly StageName[] {
    return this.#forward.get(node) ?? [];
  }

  public dependents(node: StageName): readonly StageName[] {
    return this.#reverse.get(node) ?? [];
  }

  public stages(): readonly StageName[] {
    return Array.from(this.#definitions.keys());
  }

  public sorted(): readonly StageName[] {
    const visited = new Set<StageName>();
    const resolved = new Set<StageName>();
    const output: StageName[] = [];

    const visit = (node: StageName): void => {
      if (!this.hasNode(node) || resolved.has(node)) {
        return;
      }
      if (visited.has(node)) {
        throw new Error(`Cyclic dependency detected at ${node}`);
      }
      visited.add(node);
      for (const dependency of this.dependencies(node)) {
        visit(dependency);
      }
      visited.delete(node);
      resolved.add(node);
      output.push(node);
    };

    for (const node of this.#definitions.keys()) {
      visit(node);
    }
    return output;
  }

  public upstreamPath(node: StageName, trace: StagePathContext[] = []): readonly StagePathContext[] {
    if (!this.hasNode(node)) {
      return trace;
    }
    const dependencies = this.dependencies(node);
    const next = dependencies.at(0);
    const nextTrace: StagePathContext = {
      startedBy: node,
      requestedAt: new Date().toISOString(),
      route: [node],
    };
    return next ? this.upstreamPath(next, [...trace, nextTrace]) : [...trace, nextTrace];
  }

  public downstreamPath(node: StageName, trace: StagePathContext[] = []): readonly StagePathContext[] {
    if (!this.hasNode(node)) {
      return trace;
    }
    const dependents = this.dependents(node);
    const next = dependents.at(0);
    const nextTrace: StagePathContext = {
      startedBy: node,
      requestedAt: new Date().toISOString(),
      route: [node],
    };
    return next ? this.downstreamPath(next, [...trace, nextTrace]) : [...trace, nextTrace];
  }
}

export const buildEdges = (definitions: readonly StageDefinition[]): readonly WorkflowEdge[] =>
  definitions.flatMap((definition) =>
    definition.dependencies.map((dependency) => ({
      from: definition.name,
      to: dependency,
      weightMs: 0,
    })),
  );

export const buildGraphFromDefinitions = (
  definitions: readonly StageDefinition[],
  config: WorkflowGraphConfig,
): { readonly graph: WorkflowGraph; readonly edges: readonly WorkflowEdge[] } => {
  const graph = new WorkflowGraph(definitions, config);
  return {
    graph,
    edges: buildEdges(definitions),
  };
};

export const withTopology = (graph: WorkflowGraph, order: readonly StageName[]): StagePathContext => ({
  startedBy: order.at(0) ?? 'stage:root',
  requestedAt: new Date().toISOString(),
  route: order.length ? order : graph.stages(),
});

export const collectStageSequence = <TStages extends readonly StageName[]>(
  stages: TStages,
): readonly StagePathContext[] =>
  createPipelineIterator(stages)
    .map((stage, index) => ({
    startedBy: stage,
    requestedAt: new Date(Date.now() + index * 1000).toISOString(),
    route: [stage],
    }))
    .toArray();

export const inferDepth = <TItems,>(...items: NoInfer<TItems>[]): number => items.length;

export const tuplePaths = <T extends readonly string[]>(
  left: T,
  right: readonly string[],
): readonly GraphPair<readonly [string, string]>[] =>
  left.map((leftItem, index) => ({
    first: leftItem,
    second: right[index] ?? '',
  }));
