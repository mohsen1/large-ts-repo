import type { SignalEvent, StrategyLane, StrategyMode, StrategyTuple, WorkspaceId, ScenarioId } from './types';
import { parseStrategyTuple } from './schema';
import { buildSignalMatrix, renderSignalDigest } from './signal-matrix';
import { buildWorkbenchContext, type WorkbenchContext, workbenchTuple } from './orchestration-workbench';
import { createSessionController, runSessionSeries } from './workspace-session';
import { asWorkspaceId, asScenarioId } from './types';

export const commandChannels = ['input', 'analysis', 'execution', 'feedback', 'audit'] as const;
export type CommandChannel = (typeof commandChannels)[number];
type ChannelTupleSeed = `${string}::${string}::${string}`;
type ChannelRoute = `${CommandChannel}/${string}`;

export type ChannelPayload<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  readonly route: ChannelRoute;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly body: TPayload;
  readonly options: {
    readonly retry: boolean;
    readonly priority: number;
  };
};

export interface ChannelMessage<TPayload = Record<string, unknown>> {
  readonly channel: CommandChannel;
  readonly at: string;
  readonly runId: string;
  readonly route: ChannelRoute;
  readonly payload: TPayload;
  readonly tuple: StrategyTuple;
  readonly signature: `${CommandChannel}::${string}`;
}

type ChannelRunPlan = {
  readonly planId: string;
  readonly sessionId: string;
  readonly workspace: WorkspaceId;
  readonly scenario: ScenarioId;
  readonly title: string;
  readonly lanes: readonly StrategyLane[];
  readonly steps: readonly unknown[];
  readonly metadata: Readonly<Record<string, unknown>> & {
    readonly __schema: `recovery-lab-intelligence-core::${string}`;
  };
};

export type ChannelRun<TInput extends Record<string, unknown>, TOutput> = {
  readonly context: WorkbenchContext;
  readonly input: TInput;
  readonly output: TOutput;
  readonly plan: ChannelRunPlan;
  readonly events: readonly SignalEvent[];
};

export type ChannelRegistry<TContracts extends readonly string[]> = {
  readonly contracts: TContracts;
  readonly map: {
    [K in TContracts[number]]: {
      readonly path: `${K}/${string}`;
      readonly enabled: true;
    };
  };
};

export const channelSignals = (events: readonly SignalEvent[]): readonly SignalEvent[] =>
  events.filter((event) => event.source === 'manual');

const channelSignature = (kind: CommandChannel, tuple: ChannelTupleSeed): `${CommandChannel}::${string}` =>
  `${kind}::${tuple}` as const;

const resolveMode = (mode: string): StrategyMode =>
  mode === 'simulate' || mode === 'analyze' || mode === 'stress' || mode === 'plan' || mode === 'synthesize'
    ? mode
    : 'simulate';

const resolveLane = (lane: string): StrategyLane =>
  lane === 'forecast' || lane === 'resilience' || lane === 'containment' || lane === 'recovery' || lane === 'assurance'
    ? lane
    : 'forecast';

const normalizeRoute = (channel: CommandChannel, runId: string): ChannelRoute => `${channel}/${runId}` as ChannelRoute;

const createPayload = <TPayload extends Record<string, unknown>>(
  mode: StrategyMode,
  lane: StrategyLane,
  route: ChannelRoute,
  body: TPayload,
  options: { retry: boolean; priority: number } = { retry: true, priority: 0 },
): ChannelPayload<TPayload> => ({
  route,
  mode,
  lane,
  body,
  options,
});

const createMessage = <TPayload extends Record<string, unknown>>(
  channel: CommandChannel,
  runId: string,
  tuple: StrategyTuple,
  payload: TPayload,
): ChannelMessage<TPayload> => ({
  channel,
  at: new Date().toISOString(),
  runId,
  route: normalizeRoute(channel, runId),
  payload,
  tuple,
  signature: channelSignature(channel, tuple.join('::') as ChannelTupleSeed),
});

const buildSourceRoute = (channel: CommandChannel): SignalEvent['source'] =>
  channel === 'input'
    ? 'intent'
    : channel === 'analysis'
      ? 'telemetry'
      : channel === 'execution'
        ? 'orchestration'
        : channel === 'feedback'
          ? 'policy'
          : 'manual';

export const commandChannelTuple = (mode: StrategyMode, lane: StrategyLane, runId: string): StrategyTuple =>
  parseStrategyTuple([mode, lane, `${mode}:${lane}:${runId}`, runId.length]);

export const createChannelMessage = <TPayload extends Record<string, unknown>>(
  channel: CommandChannel,
  mode: StrategyMode,
  lane: StrategyLane,
  payload: TPayload,
): ChannelMessage<TPayload> => {
  const tuple = commandChannelTuple(mode, lane, `${mode}-${lane}-${Object.keys(payload).length}`);
  return createMessage(channel, `${mode}-${lane}-${Date.now()}`, tuple, payload);
};

const enrichPayload = <TPayload extends Record<string, unknown>>(
  request: ChannelPayload<TPayload>,
  route: string,
  message: ChannelMessage<TPayload>,
): ChannelPayload<TPayload> => ({
  ...request,
  route: route as ChannelRoute,
  body: {
    ...request.body,
    ...message.payload,
  },
});

const routeDigest = (tuple: readonly [StrategyMode, StrategyLane, string, number]): ChannelRoute =>
  (`${tuple[0]}/${tuple[2]}`) as ChannelRoute;

type SessionSeriesRequest<TInput extends Record<string, unknown>> = {
  readonly workspace: string;
  readonly input: TInput;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
};

type ChannelStack = {
  use<T>(value: T): T;
  dispose?(): void;
  disposeAsync?(): Promise<void>;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

const fallbackStack: ChannelStack = {
  use: <T>(value: T): T => value,
  [Symbol.dispose]() {},
  [Symbol.asyncDispose]() {
    return Promise.resolve();
  },
};

const createStack = (): ChannelStack => {
  const candidate = globalThis as unknown as {
    AsyncDisposableStack?: new () => {
      use<T>(value: T): T;
      dispose(): void;
      disposeAsync(): Promise<void>;
    };
  };
  if (candidate.AsyncDisposableStack === undefined) {
    return fallbackStack;
  }
  try {
    const stack = new candidate.AsyncDisposableStack();
    return {
      use: <T>(value: T): T => stack.use(value),
      [Symbol.dispose]() {
        stack.dispose?.();
      },
      [Symbol.asyncDispose]() {
        return stack.disposeAsync?.() ?? Promise.resolve();
      },
      dispose: () => {
        stack.dispose?.();
      },
      disposeAsync: () => stack.disposeAsync?.() ?? Promise.resolve(),
    };
  } catch {
    return fallbackStack;
  }
};

const eventFromMode = (mode: StrategyMode): SignalEvent => ({
  source: 'telemetry',
  severity: mode === 'synthesize' || mode === 'stress' ? 'warn' : 'info',
  at: new Date().toISOString(),
  detail: { mode },
});

export const processChannels = async <
  TInput extends Record<string, unknown>,
  TOutput,
  TChannel extends readonly string[],
>(
  workspace: string,
  channels: {
    readonly input: CommandChannel;
    readonly analysis: CommandChannel;
    readonly execution: CommandChannel;
  },
  contract: ChannelRegistry<TChannel>,
  runner: (payload: ChannelPayload<TInput>) => Promise<TOutput>,
): Promise<readonly ChannelRun<TInput, TOutput>[]> => {
  const requestSeed = createPayload(
    'simulate',
    'forecast',
    normalizeRoute('input', 'seed'),
    {
      workspace,
      contractCount: contract.contracts.length,
      channels,
      mode: 'simulate' as StrategyMode,
      lane: 'forecast' as StrategyLane,
    },
    {
      retry: true,
      priority: 5,
    },
  );

  const tuple = commandChannelTuple(requestSeed.mode, requestSeed.lane, workspace);
  const context = buildWorkbenchContext(workspace, workspace, requestSeed.mode, requestSeed.lane);
  const controller = createSessionController(workspace, tuple);

  const messages = [
    createChannelMessage('input', 'simulate', 'forecast', requestSeed.body),
    createChannelMessage('analysis', 'analyze', 'recovery', { ...requestSeed.body, phase: 'analysis' }),
    createChannelMessage('execution', 'plan', 'assurance', { ...requestSeed.body, phase: 'execution' }),
    createChannelMessage('feedback', 'synthesize', 'assurance', { ...requestSeed.body, phase: 'feedback' }),
  ];

  const runs: ChannelRun<TInput, TOutput>[] = [];

  for (const message of messages) {
    const matrix = buildSignalMatrix(
      [
        {
          source: buildSourceRoute(message.channel),
          severity: eventFromMode(message.tuple[0]).severity,
          at: message.at,
          detail: {
            route: message.tuple.join(':'),
            signature: message.signature,
          },
        },
        {
          source: 'orchestration',
          severity: 'warn',
          at: new Date().toISOString(),
          detail: {
            contractCount: contract.contracts.length,
            phase: message.channel,
          },
        },
      ],
      workspace,
    );

    const digest = renderSignalDigest(matrix);
    const channelPayload = enrichPayload(requestSeed, digest, message);
    const body = {
      ...channelPayload.body,
      route: message.tuple.join(':'),
      phase: message.channel,
    } as unknown as TInput;

    const payload: ChannelPayload<TInput> = {
      route: channelPayload.route,
      mode: message.tuple[0],
      lane: message.tuple[1],
      body,
      options: channelPayload.options,
    };
    const output = await runner(payload);

    runs.push({
      context: {
        ...context,
        mode: toMode(message.tuple[0]),
        lane: toLane(message.tuple[1]),
      },
      input: body,
      output,
      plan: {
        planId: String(context.planId),
        sessionId: String(context.sessionId),
        workspace: asWorkspaceId(context.workspace),
        scenario: asScenarioId(context.scenario),
        title: `Channel ${message.channel}`,
        lanes: [toLane(message.tuple[1])],
        steps: [],
        metadata: {
          __schema: 'recovery-lab-intelligence-core::runtime',
          route: message.tuple.join(':'),
          digest,
          contracts: contract.contracts.join(','),
          createdAt: message.at,
          tuple: message.tuple,
        },
      },
      events: [
        {
          source: buildSourceRoute(message.channel),
          severity: 'info',
          at: message.at,
          detail: {
            route: message.tuple.join(':'),
            tuple: message.tuple,
            runId: message.runId,
          },
        },
      ],
    });
  }

  const stack = createStack();
  try {
    await runSessionSeries<
      TInput,
      TOutput
    >(
      [
        {
          workspace,
          input: {
            ...requestSeed.body,
            ...(runs.at(0)?.output as Record<string, unknown>),
          } as unknown as TInput,
          mode: toMode(toRecordMode(runs.at(0)?.context.mode ?? 'simulate')),
          lane: toLane(runs.at(0)?.context.lane ?? 'forecast'),
        },
        {
          workspace,
          input: {
            ...requestSeed.body,
            ...(runs.at(1)?.output as Record<string, unknown>),
          } as unknown as TInput,
          mode: toMode(toRecordMode(runs.at(1)?.context.mode ?? 'analyze')),
          lane: toLane(runs.at(1)?.context.lane ?? 'recovery'),
        },
      ] satisfies readonly SessionSeriesRequest<TInput>[],
      ({ workspace: runWorkspace, mode, lane, input }) => {
        const requestContext = workbenchTuple(mode, lane, `${runWorkspace}:${Object.keys(input).length}`);
        using session = stack.use(controller);
        void session.toScope({
          workspace: asWorkspaceId(runWorkspace),
          scenario: context.scenario,
          route: `workbench:${runWorkspace}` as const,
          tuple: requestContext,
        });
        return runner({
          route: routeDigest(requestContext),
          mode,
          lane,
          body: {
            ...input,
            route: requestContext.join(':'),
            source: `session:${runWorkspace}`,
          } as TInput,
          options: {
            retry: false,
            priority: mode === 'stress' ? 8 : 2,
          },
        });
      },
    );
  } finally {
    await stack[Symbol.asyncDispose]();
  }

  return runs;
};

const toRecordMode = resolveMode;
const toMode = resolveMode;
const toLane = resolveLane;
