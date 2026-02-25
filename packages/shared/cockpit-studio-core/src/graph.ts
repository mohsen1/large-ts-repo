import { type PluginDependency, type PluginId, type PluginKind, type StudioPluginDefinition } from './contracts';

export type StudioDependencyEdge = {
  readonly before: PluginId;
  readonly after: PluginId;
  readonly reason: string;
};

const normalize = (value: PluginId): string => value.toLowerCase().trim();

const byName = (left: PluginId, right: PluginId): number => {
  const leftValue = normalize(left);
  const rightValue = normalize(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
};

export class StudioDependencyGraph {
  readonly #nodes = new Map<PluginId, Set<PluginId>>();
  readonly #reverse = new Map<PluginId, Set<PluginId>>();
  readonly #stage = new Map<PluginId, PluginKind>();
  readonly #definitions: Map<PluginId, StudioPluginDefinition>;

  constructor(entries: readonly StudioDependencyEdge[] = [], definitions: readonly StudioPluginDefinition[] = []) {
    this.#definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    for (const definition of definitions) {
      this.#nodes.set(definition.id, new Set());
      this.#reverse.set(definition.id, new Set());
      this.#stage.set(definition.id, definition.kind);
    }
    for (const edge of entries) {
      this.add(edge.before, edge.after);
    }
  }

  public add(before: PluginId, after: PluginId): void {
    if (before === after || !this.#nodes.has(before) || !this.#nodes.has(after)) {
      return;
    }
    this.#nodes.get(before)?.add(after);
    this.#reverse.get(after)?.add(before);
  }

  public addDefinitions(definitions: readonly StudioPluginDefinition[]): void {
    for (const definition of definitions) {
      if (!this.#nodes.has(definition.id)) {
        this.#nodes.set(definition.id, new Set());
        this.#reverse.set(definition.id, new Set());
        this.#stage.set(definition.id, definition.kind);
      }
      for (const dependency of definition.dependencies) {
        this.add(dependency.upstreamId, definition.id);
      }
    }
  }

  public pluginIds(): readonly PluginId[] {
    return [...this.#nodes.keys()].toSorted(byName);
  }

  public edges(): readonly StudioDependencyEdge[] {
    const list: StudioDependencyEdge[] = [];
    for (const [before, afters] of this.#nodes.entries()) {
      for (const after of afters) {
        list.push({
          before,
          after,
          reason: `depends:${before}->${after}`,
        });
      }
    }
    return list.toSorted((left, right) => byName(left.before, right.before) || byName(left.after, right.after));
  }

  public outgoing(pluginId: PluginId): readonly PluginId[] {
    return [...(this.#nodes.get(pluginId) ?? [])].toSorted(byName);
  }

  public incoming(pluginId: PluginId): readonly PluginId[] {
    return [...(this.#reverse.get(pluginId) ?? [])].toSorted(byName);
  }

  public topologicalSort(): readonly PluginId[] {
    const degree = new Map<PluginId, number>();
    const queue: PluginId[] = [];
    const resolved: PluginId[] = [];

    for (const [node, incoming] of this.#reverse) {
      degree.set(node, incoming.size);
      if (incoming.size === 0) {
        queue.push(node);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      resolved.push(current);
      for (const next of this.#nodes.get(current) ?? []) {
        const nextDegree = Math.max(0, (degree.get(next) ?? 0) - 1);
        degree.set(next, nextDegree);
        if (nextDegree === 0) {
          queue.push(next);
          queue.sort(byName);
        }
      }
    }

    const unresolved = [...this.#nodes.keys()].filter((candidate) => !resolved.includes(candidate));
    if (unresolved.length > 0) {
      return [...resolved, ...unresolved.toSorted(byName)];
    }
    return resolved;
  }

  public stageOrdered(): readonly PluginId[] {
    return [...this.#stage.entries()]
      .toSorted((left, right) => {
        if (left[1] === right[1]) {
          return byName(left[0], right[0]);
        }
        return 0;
      })
      .map(([pluginId]) => pluginId);
  }

  public *iterate() {
    for (const pluginId of this.topologicalSort()) {
      yield {
        pluginId,
        stage: this.#stage.get(pluginId) ?? 'ingest',
        incoming: this.incoming(pluginId),
        outgoing: this.outgoing(pluginId),
      };
    }
  }

  public static fromDependencies(definitions: readonly StudioPluginDefinition[]): StudioDependencyGraph {
    const edges = definitions
      .flatMap((definition) =>
        definition.dependencies.map((dependency) =>
          ({
            before: dependency.upstreamId,
            after: definition.id,
            reason: `dependency:${dependency.upstreamId}->${definition.id}:${dependency.weight}`,
          }) satisfies StudioDependencyEdge,
        ),
      )
      .toSorted((left, right) => byName(left.before, right.before) || byName(left.after, right.after));
    const graph = new StudioDependencyGraph(edges, definitions);
    return graph;
  }

  public static fromDependencyMap(definitions: readonly StudioPluginDefinition[]): StudioDependencyGraph {
    const graph = new StudioDependencyGraph([], definitions);
    graph.addDefinitions(definitions);
    return graph;
  }

  public static orderByDependencyAndKind(definitions: readonly StudioPluginDefinition[]): readonly PluginId[] {
    const graph = StudioDependencyGraph.fromDependencyMap(definitions);
    return graph.topologicalSort();
  }
}

export const dependenciesToGraph = (
  dependencies: readonly PluginDependency[],
): readonly { readonly before: PluginId; readonly after: PluginId; readonly reason: string }[] =>
  dependencies
    .toSorted((left, right) => left.upstreamId.localeCompare(right.upstreamId))
    .map((dependency) => ({
      before: dependency.upstreamId,
      after: dependency.upstreamId,
      reason: `${dependency.upstreamId}->${dependency.weight}`,
    }));
