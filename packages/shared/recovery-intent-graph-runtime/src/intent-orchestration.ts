import { makeDefaultSnapshot, scoreGraph, walkSnapshot, type IntentGraphSnapshot } from './intent-graph';
import type { IntentNodeId, IntentNodeDef } from './intent-graph';
import { makeIntentionId, makeSignalId, type IntentionId, type SignalId } from './intent-branding';
import type {
  IntentGraphTask,
  IntentInput,
  IntentOutput,
  IntentSignal,
} from './intent-types';
import {
  IntentPluginRegistry,
  makeBoundContext,
  makeIntentPluginRegistry,
  type IntentRegistryPlugin,
} from './intent-registry';

export interface IntentionPolicy<TState = string> {
  readonly requires: ReadonlySet<TState>;
  readonly confidenceFloor: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface IntentIntentPayload {
  readonly intentName: string;
  readonly tenant: string;
  readonly severity: number;
  readonly policy: IntentionPolicy<string>;
}

export type IntentionState = 'draft' | 'simulating' | 'approved' | 'running' | 'completed' | 'aborted';

export interface IntentionRecord {
  readonly id: IntentionId<string>;
  readonly graphId: string;
  readonly graph: IntentGraphSnapshot<IntentIntentPayload>;
  readonly createdAtMs: number;
  readonly labels: Readonly<Record<string, string>>;
}

export interface IntentRunRecord {
  readonly intentionId: IntentionId<string>;
  readonly graph: string;
  readonly state: IntentionState;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly result?: IntentionOutputBundle;
}

export interface IntentionOutputBundle {
  readonly score: number;
  readonly path: readonly string[];
  readonly signals: readonly IntentSignal[];
  readonly traces: readonly IntentTrace[];
}

export interface IntentRunTrace {
  readonly pluginName: string;
  readonly durationMs: number;
  readonly stage: string;
}

export interface IntentionRuntimeContext {
  readonly tenant: string;
  readonly workspace: string;
  readonly requestId: string;
  readonly scope: string;
}

type IntentRouteSignal<TPayload extends IntentInput> = TPayload extends IntentInput<infer _, infer TRoute>
  ? TRoute extends string
    ? `route:${TRoute}`
    : `route:unknown`
  : `route:unknown`;

type BoundedSignalId = SignalId<string>;
const makeBundleId = <TScope extends string>(scope: TScope, id: string): BoundedSignalId =>
  makeSignalId(scope, id);

const routeSignalByType = <TInput extends IntentInput>(input: TInput): readonly string[] => {
  if (input.kind === 'intent:bootstrap') return ['bootstrap', 'ready'];
  if (input.kind.startsWith('intent:')) return ['intent', input.kind.slice(7)];
  return ['default'];
};

const projectSignals = (
  snapshot: IntentGraphSnapshot<unknown>,
  context: IntentionRuntimeContext,
): readonly IntentSignal[] =>
  walkSnapshot(snapshot).map((node) => ({
    tenant: context.tenant as IntentSignal['tenant'],
    workspace: context.workspace as IntentSignal['workspace'],
    eventType: node.kind,
    confidence: Math.min(1, Math.max(0, node.score / 100)),
    metadata: {
      nodeId: node.id,
      title: node.title,
      scope: context.scope,
      requestId: context.requestId,
    },
  }));

export interface OrchestrationEnvelope {
  readonly requestId: string;
  readonly tenant: string;
  readonly workspace: string;
  readonly scope: string;
}

interface SimulationProfile<TInput extends IntentInput> {
  readonly context: IntentionRuntimeContext;
  readonly input: TInput;
  readonly routeSignals: readonly IntentSignal[];
  readonly traceToken: string;
}

export class IntentSimulationEngine<TPlugins extends readonly IntentRegistryPlugin[]> {
  readonly #registry: IntentPluginRegistry<TPlugins>;

  constructor(plugins: TPlugins) {
    this.#registry = makeIntentPluginRegistry(plugins);
  }

  get plugins(): readonly IntentRegistryPlugin[] {
    return [...this.#registry];
  }

  get pluginCount(): number {
    return this.#registry.stats.pluginCount;
  }

  simulateGraph(context: IntentionRuntimeContext, graph: IntentGraphSnapshot<IntentIntentPayload>): IntentionOutputBundle {
    const nodes = walkSnapshot(graph);
    const traces: IntentTrace[] = [
      {
        pluginName: 'bootstrap',
        durationMs: nodes.length,
        stage: `simulate:${context.requestId}`,
      },
    ];

    return {
      score: scoreGraph(graph),
      path: nodes.map((node) => `${node.kind}:${node.title}`),
      signals: projectSignals(graph, context),
      traces,
    };
  }

  async simulateRoute<TInput extends IntentInput>(profile: SimulationProfile<TInput>): Promise<IntentionOutputBundle> {
    const graph = makeDefaultSnapshot<IntentIntentPayload>(`runtime-${profile.traceToken}`, [] as never, [] as never);
    const inputConfidence = profile.routeSignals.reduce((acc, signal) => Math.max(acc, signal.confidence), 0);
    const graphPayload: IntentIntentPayload = {
      intentName: profile.input.kind,
      tenant: profile.context.tenant,
      severity: 1,
      policy: {
        requires: new Set(['draft']),
        confidenceFloor: 0.7,
        metadata: { kind: profile.context.scope },
      },
    };
    const simulationSnapshot = makeDefaultSnapshot<IntentIntentPayload>(`runtime-${profile.traceToken}`, [
      {
        id: `runtime:${profile.traceToken}` as unknown as IntentNodeId,
        kind: 'source',
        title: graphPayload.intentName,
        payload: graphPayload,
        score: 12,
        version: 1,
      },
    ] as readonly IntentNodeDef<IntentNodeDef['kind'], IntentIntentPayload>[], [] as never);
    const result = this.simulateGraph(profile.context, simulationSnapshot);

    return {
      ...result,
      score: result.score + inputConfidence,
      path: ['simulate', ...result.path],
      traces: [
        ...result.traces,
        {
          pluginName: `route:${routeSignalByType(profile.input)[0]}`,
          durationMs: 5,
          stage: profile.traceToken,
        },
      ],
    };
  }

  async run<TInput extends IntentInput>(context: IntentionRuntimeContext, input: TInput): Promise<IntentRunRecord> {
    const traceToken = `${context.tenant}:${context.scope}:${context.requestId}`;
    const traceRoute = (`route:${input.kind}` as IntentRouteSignal<TInput>) as string;
    const traceBundle = makeBundleId(context.scope, traceRoute);
    const startedAtMs = Date.now();
    const graph = makeDefaultSnapshot<IntentIntentPayload>(`${context.scope}-graph`, [] as never, [] as never);
    const routeSignals = this.#registry.inferSignals(input, makeBoundContext(context.tenant, context.workspace, context.requestId));
    const result = await this.simulateRoute({
      context,
      input: {
        ...input,
        payload: {
          intentName: input.kind,
          tenant: context.tenant,
          severity: 1,
          policy: {
            requires: new Set(['draft']),
            confidenceFloor: 0.7,
            metadata: { traceBundle },
          },
        },
      },
      routeSignals,
      traceToken,
    });

    return {
      intentionId: makeIntentionId(context.scope, `graph:${traceToken}`) as unknown as IntentionId<string>,
      graph: graph.name,
      state: 'completed',
      startedAt: startedAtMs,
      updatedAt: Date.now(),
      result,
    };
  }

  async execute<TInput extends IntentInput, TNodePayload>(
    context: IntentionRuntimeContext,
    input: TInput,
    graph: IntentGraphSnapshot<TNodePayload>,
  ): Promise<IntentOutput<IntentGraphSnapshot<TNodePayload>>> {
    const traceRoute = (`route:${input.kind}` as IntentRouteSignal<TInput>) as string;
    const bundleId = makeBundleId('runtime', traceRoute);
    const runRecord = await this.run(context, input);

    return {
      output: graph,
      emittedSignals: runRecord.result?.signals ?? [],
      runtimeMs: bundleId.length + (runRecord.result?.score ?? 0),
    };
  }
}

export const makeIntentRuntime = <TPlugins extends readonly IntentRegistryPlugin[]>(plugins: TPlugins) =>
  new IntentSimulationEngine<TPlugins>(plugins);

export type IntentTrace = IntentRunTrace;

export const bootstrapTask: IntentGraphTask<IntentInput> = {
  id: makeIntentionId('bootstrap', 'task') as unknown as IntentGraphTask<IntentInput>['id'],
  name: 'intent-bootstrap-task',
  state: 'idle',
  input: {
    kind: 'intent:bootstrap',
    payload: {},
  },
  path: 'graph.intention.route',
} as const;
