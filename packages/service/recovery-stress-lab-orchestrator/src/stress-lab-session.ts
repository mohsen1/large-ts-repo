import {
  withAsyncPluginScope,
  createPluginContext,
  type PluginSession,
  createPluginDefinitionNamespace,
  pluginSessionConfigFrom,
} from '@shared/stress-lab-runtime';
import {
  normalizeGraphInput,
  type WorkflowNode,
  type WorkflowGraph,
  type WorkloadSignal,
  type WorkflowNodeId,
  collectTraversal,
  traverseGraph,
} from '@domain/recovery-stress-lab-intelligence/flow-graph';
import { buildFleetPlan } from './stress-lab-fleet';
import { inspectFleetQuick } from './stress-lab-observer';

export type SessionStatus = 'booting' | 'running' | 'closing' | 'closed';

export interface SessionConfig {
  readonly tenantId: string;
  readonly zone: string;
  readonly graph: ReturnType<typeof normalizeGraphInput>;
}

export interface SessionEvent {
  readonly at: number;
  readonly kind: 'init' | 'tick' | 'stop';
  readonly note: string;
}

export interface SessionState {
  readonly status: SessionStatus;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly events: readonly SessionEvent[];
  readonly nodes: readonly WorkflowNode[];
}

export class StressLabSession {
  #state: SessionState;
  #sessionStack = globalThis as unknown as {
    AsyncDisposableStack: new () => {
      [Symbol.asyncDispose]: () => Promise<void>;
      [Symbol.dispose](): void;
    };
  };

  constructor(private readonly config: SessionConfig) {
    const now = Date.now();
    this.#state = {
      status: 'booting',
      startedAt: now,
      updatedAt: now,
      events: [{ at: now, kind: 'init', note: `${config.tenantId}@${config.zone}` }],
      nodes: config.graph.nodes,
    };
  }

  get state(): SessionState {
    return this.#state;
  }

  async run(): Promise<SessionState> {
    const AsyncDisposableStackCtor = this.#sessionStack.AsyncDisposableStack;
    using _scope = new AsyncDisposableStackCtor();
    this.#state = {
      ...this.#state,
      status: 'running',
      updatedAt: Date.now(),
      events: [...this.#state.events, { at: Date.now(), kind: 'tick', note: 'run-started' }],
    };

    const plan = buildFleetPlan(this.config.tenantId, this.config.zone, {
      region: this.config.zone,
      nodes: this.config.graph.nodes.map((node) => ({ id: String(node.id), lane: node.lane, kind: node.kind, outputs: [] })),
      edges: this.config.graph.edges.map((edge) => ({ id: String(edge.id), from: String(edge.from), to: edge.to.map((node) => String(node)), direction: edge.direction, channel: String(edge.channel) })),
    });

    await this.withSessionContext(async (session) => {
      void session;
      const count = collectTraversal(plan.graph, plan.graph.nodes[0]?.id as WorkflowNodeId).length;
      this.#state = {
        ...this.#state,
        nodes: plan.graph.nodes,
        updatedAt: Date.now(),
        events: [...this.#state.events, { at: Date.now(), kind: 'tick', note: `run-nodes=${count}` }],
      };
    });

    const quick = await inspectFleetQuick({ tenant: this.config.tenantId, zone: this.config.zone, mode: 'audit' }, [
      { id: this.config.tenantId, tenantId: this.config.tenantId, lane: 'observe', phase: 'observe', score: 0.5, createdAt: Date.now(), source: 'session' } as WorkloadSignal,
    ]);

    this.#state = {
      ...this.#state,
      status: 'closing',
      updatedAt: Date.now(),
      events: [...this.#state.events, { at: Date.now(), kind: 'tick', note: `quick=${quick}` }],
    };

    this.#state = {
      ...this.#state,
      status: 'closed',
      updatedAt: Date.now(),
      events: [...this.#state.events, { at: Date.now(), kind: 'stop', note: 'run-complete' }],
    };

    return this.#state;
  }

  private async withSessionContext<T>(run: (session: PluginSession) => Promise<T>): Promise<T> {
    const namespace = createPluginDefinitionNamespace('recovery:stress:lab');
    const config = pluginSessionConfigFrom(this.config.tenantId, namespace, `${this.config.tenantId}::${this.config.zone}`);
    return withAsyncPluginScope(config, async (session) => run(session));
  }

  [Symbol.dispose](): void {
    this.#state = {
      ...this.#state,
      status: 'closed',
      updatedAt: Date.now(),
      events: [...this.#state.events, { at: Date.now(), kind: 'stop', note: 'disposed' }],
    };
  }
}

export const startSession = async (
  tenantId: string,
  zone: string,
  fixture: {
    region: string;
    nodes: { id: string; lane: 'observe' | 'prepare' | 'simulate' | 'recommend' | 'report' | 'restore' | 'verify' | 'retrospective'; kind: string; outputs: readonly string[] }[];
    edges: { id: string; from: string; to: readonly string[]; direction: 'northbound' | 'southbound' | 'interlane'; channel: string }[],
  },
): Promise<SessionState> => {
  const graph = normalizeGraphInput(fixture);
  const session = new StressLabSession({ tenantId, zone, graph });
  const state = await session.run();
  return state;
};

export const inspectGraphSignals = (graph: WorkflowGraph): {
  readonly signalCount: number;
  readonly firstSignal: string;
} => {
  const traversal = collectTraversal(graph, graph.nodes[0]?.id);
  const map = traversal.reduce<Record<string, number>>((acc, entry) => {
    const lane = entry.node.lane;
    acc[lane] = (acc[lane] ?? 0) + 1;
    return acc;
  }, {});
  return {
    signalCount: traversal.length,
    firstSignal: Object.entries(map)
      .map(([lane, count]) => `${lane}:${count}`)
      .join(',')
      .toUpperCase(),
  };
};

export const listGraphSequence = <T extends WorkflowGraph>(graph: T): string[] => {
  const sequence: string[] = [];
  for (const entry of traverseGraph(graph, graph.nodes[0]?.id as WorkflowNodeId)) {
    sequence.push(`${entry.step}:${entry.node.kind}`);
  }
  return sequence;
};

const sessionManifest = {
  key: 'stress-lab-session',
  version: 1,
} as const;

export const sessionSummaryText = (status: SessionStatus): string => `${sessionManifest.key}::${sessionManifest.version}::${status}`;

export const createContext = (tenantId: string, zone: string) =>
  createPluginContext(tenantId, createPluginDefinitionNamespace('recovery:stress:lab'), 'ctx', { zone });
