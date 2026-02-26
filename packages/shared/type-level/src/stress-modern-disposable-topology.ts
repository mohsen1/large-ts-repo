export type TopologyNode = {
  readonly id: `node-${number}`;
  readonly route: string;
  readonly active: boolean;
};

export type TopologyMap<T extends readonly TopologyNode[]> = {
  readonly size: T['length'];
  readonly nodes: { [K in keyof T]: T[K] extends TopologyNode ? T[K]['route'] : never };
};

export interface ScopedRouteLease<T extends string> {
  readonly id: T;
  close: () => Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  [Symbol.dispose](): void;
}

export interface ScopedRouteScope {
  readonly nodeCount: number;
  readonly nodes: TopologyNode[];
  dispose(): void;
  [Symbol.dispose](): void;
}

const openLease = async <T extends string>(id: T): Promise<ScopedRouteLease<T>> => {
  await Promise.resolve();
  return {
    id,
    close: async () => {
      await Promise.resolve(id);
    },
    [Symbol.asyncDispose]: async () => {
      await Promise.resolve(id);
    },
    [Symbol.dispose]: () => {
      return void id;
    },
  } as ScopedRouteLease<T>;
};

export class TopologyScope implements ScopedRouteScope {
  public constructor(public readonly nodes: TopologyNode[]) {}

  public get nodeCount() {
    return this.nodes.length;
  }

  public dispose(): void {
    void this.nodes;
  }

  public [Symbol.dispose](): void {
    this.dispose();
  }
}

export const topologySeed = Promise.resolve().then(() => {
  const values = [
    { id: 'node-1', route: '/nodes/1', active: true },
    { id: 'node-2', route: '/nodes/2', active: false },
    { id: 'node-3', route: '/nodes/3', active: true },
    { id: 'node-4', route: '/nodes/4', active: true },
    { id: 'node-5', route: '/nodes/5', active: false },
  ];

  return {
    nodes: values,
    map: values.map((entry) => entry.id).filter((entry) => entry.includes('-')).map((entry) => entry.length),
  };
});

export type TopologySeed = typeof topologySeed;
export type TopologySummary = TopologyMap<readonly TopologyNode[]>;

export const mapIteratorLike = <T>(collection: TopologyNode[], selector: (value: T) => boolean): T[] => {
  const values: T[] = [];

  for (let index = 0; index < collection.length; index++) {
    const value = collection[index] as unknown as T;
    if (selector(value)) {
      values.push(value);
    }
  }

  return values;
};

export const runTopologyDisposal = async (raw: readonly string[]): Promise<TopologySummary> => {
  await using stack = new AsyncDisposableStack();

  const routeNodes: TopologyNode[] = raw
    .map((value, index) => ({
      id: `node-${index}` as const,
      route: value,
      active: index % 2 === 0,
    }))
    .sort((a, b) => (a.route.localeCompare(b.route) > 0 ? 1 : -1))
    .filter((item) => item.active);

  const routes = new Map<string, TopologyNode>();
  for (let index = 0; index < routeNodes.length; index++) {
    const node = routeNodes[index]!;
    routes.set(node.id, node);
  }

  const routeKeys: string[] = [];
  const routeValues: TopologyNode[] = [];
  routes.forEach((route, key) => {
    routeKeys.push(key);
    routeValues.push(route);
  });

  const scopeHandle = await openLease('scope-topology');
  stack.use(scopeHandle);

  const topologyNodes = mapIteratorLike(routeValues, (entry) => (entry as TopologyNode).active);
  const topologyKeys = mapIteratorLike(routeValues, (entry) => (entry as TopologyNode).id.includes('node-'));

  void topologyNodes;
  void topologyKeys;
  void routeKeys;

  const scopeContainer = new TopologyScope(routeNodes);
  stack.use(scopeContainer);

  return {
    size: routeNodes.length,
    nodes: routeNodes.map((item) => item.route),
  };
};
