import { type NoInfer } from '@shared/type-level';
import {
  toNode,
  laneFromSeverity,
  type LatticePhase,
  type LatticeLane,
  type LatticeNode,
  buildSummaryFromNodes,
} from './advanced-types';
import type { SignalEvent, StrategyMode, StrategyLane } from './types';
import { buildSignalMatrix, summarizeMatrix } from './signal-matrix';
import { buildWorkbenchContext, type WorkbenchManifest, summarizeWorkbenchSignals } from './orchestration-workbench';

export const workspaceSessionStates = ['initializing', 'running', 'collecting', 'closed', 'failed'] as const;
export type WorkspaceSessionState = (typeof workspaceSessionStates)[number];
export type WorkspaceMode = StrategyMode;
export type WorkspaceLane = StrategyLane;

export interface WorkspaceEnvelope {
  readonly sessionId: string;
  readonly workspace: string;
  readonly tuple: readonly [string, string, string, number];
  readonly state: WorkspaceSessionState;
  readonly startedAt: string;
}

export interface WorkspaceSessionMetrics {
  readonly matrixRowCount: number;
  readonly phaseCount: number;
  readonly highestLane: LatticeLane;
  readonly summaryScore: number;
}

export interface WorkspaceSessionScope {
  readonly state: WorkspaceSessionState;
  readonly manifest: WorkbenchManifest;
  readonly metrics: WorkspaceSessionMetrics;
  readonly envelope: WorkspaceEnvelope;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

interface SessionEvent {
  readonly at: string;
  readonly phase: LatticePhase;
  readonly lane: LatticeLane;
  readonly source: string;
}

type AnyWorkspaceStack = {
  dispose: () => void;
  disposeAsync: () => Promise<void>;
  use<T>(value: T): T;
};
const fallbackStack: AnyWorkspaceStack = {
  dispose: () => undefined,
  disposeAsync: async () => undefined,
  use: <T>(value: T): T => value,
};

const createStack = (): AnyWorkspaceStack => {
  const candidate = (globalThis as unknown as { AsyncDisposableStack?: new () => AnyWorkspaceStack }).AsyncDisposableStack;
  if (candidate === undefined) {
    return fallbackStack;
  }
  try {
    return new candidate();
  } catch {
    return fallbackStack;
  }
};

export const buildSessionEnvelope = (
  sessionId: string,
  workspace: string,
  tuple: readonly [string, string, string, number],
): WorkspaceEnvelope => ({
  sessionId,
  workspace,
  tuple,
  state: 'initializing',
  startedAt: new Date().toISOString(),
});

export const runSessionEnvelope = async (
  workspace: string,
  tuple: readonly [string, string, string, number],
): Promise<WorkspaceEnvelope> => ({ ...buildSessionEnvelope(`${workspace}::${Date.now()}`, workspace, tuple), state: 'running' });

const inferState = (events: readonly SessionEvent[]): WorkspaceSessionState => {
  if (events.length === 0) {
    return 'initializing';
  }
  if (events.some((entry) => entry.phase === 'review')) {
    return 'closed';
  }
  if (events.some((entry) => entry.phase === 'rank')) {
    return 'collecting';
  }
  if (events.some((entry) => entry.phase === 'capture')) {
    return 'running';
  }
  return 'failed';
};

export class WorkbenchSessionController<TState extends WorkspaceSessionState = WorkspaceSessionState> {
  readonly #stack = createStack();
  readonly #events: SessionEvent[] = [];
  readonly #sessionId: string;
  #closed = false;
  #state: WorkspaceSessionState = 'initializing';

  constructor(
    private readonly workspace: string,
    private readonly tuple: readonly [string, string, string, number],
  ) {
    this.#sessionId = `${workspace}::${Date.now()}`;
    this.#state = 'running';
  }

  get state(): TState {
    return this.#state as TState;
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get envelope(): WorkspaceEnvelope {
    return {
      sessionId: this.#sessionId,
      workspace: this.workspace,
      tuple: this.tuple,
      state: inferState(this.#events),
      startedAt: new Date().toISOString(),
    };
  }

  record(phase: LatticePhase, lane: LatticeLane, source: string): void {
    if (this.#closed) return;
    this.#events.push({ at: new Date().toISOString(), phase, lane, source });
    this.#state = inferState(this.#events);
  }

  attach<T>(session: T): T {
    return this.#stack.use(session);
  }

  async toSignalMatrix<T extends readonly SignalEvent[]>(events: T, tenantId: string) {
    return buildSignalMatrix(events, tenantId);
  }

  toMetrics<TEvents extends readonly SignalEvent[]>(events: TEvents): WorkspaceSessionMetrics {
    const nodes = events.map((event, index) =>
      toNode(
        event.severity === 'warn' ? 'analyze' : event.severity === 'error' ? 'stress' : event.severity === 'critical' ? 'stress' : 'simulate',
        laneFromSeverity(event.severity),
        'capture',
        event,
      ) as LatticeNode<SignalEvent>,
    );
    const summary = buildSummaryFromNodes(nodes);
    const laneTotals = summarizeWorkbenchSignals(events);
    const highest = laneTotals.critical > 0 || laneTotals.fatal > 0 ? 'assurance' : 'forecast';
    return {
      matrixRowCount: events.length,
      phaseCount: nodes.length,
      highestLane: highest,
      summaryScore: summary.score,
    };
  }

  toScope(manifest: WorkbenchManifest): WorkspaceSessionScope {
    const metrics = this.toMetrics([]);
    const controller = this;
    return {
      state: this.#state,
      manifest,
      metrics,
      envelope: this.envelope,
      [Symbol.dispose]() {
        controller.#closed = true;
        controller.#state = 'closed';
      },
      async [Symbol.asyncDispose]() {
        controller.#closed = true;
        controller.#state = 'closed';
        await controller.#stack.disposeAsync();
      },
    };
  }

  [Symbol.dispose](): void {
    this.#closed = true;
    this.#state = 'closed';
    this.#stack.dispose();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    this.#state = 'closed';
    await this.#stack.disposeAsync();
  }
}

export const createSessionController = (workspace: string, tuple: readonly [string, string, string, number]): WorkbenchSessionController => {
  return new WorkbenchSessionController(workspace, tuple);
};

export const runSessionSeries = async <TInput extends Record<string, unknown>, TOutput>(
  requests: readonly {
    workspace: string;
    input: TInput;
    mode: WorkspaceMode;
    lane: WorkspaceLane;
  }[],
  runner: (req: { workspace: string; input: TInput; mode: WorkspaceMode; lane: WorkspaceLane }) => Promise<TOutput>,
): Promise<readonly WorkspaceSessionMetrics[]> => {
  const stack = createStack();
  try {
    const summaries: WorkspaceSessionMetrics[] = [];
    for (const req of requests) {
      const tuple: [string, string, string, number] = [req.mode, req.lane, req.workspace, Object.keys(req.input).length];
      const controller = createSessionController(req.workspace, tuple);
      const session = stack.use(controller);
      const context = buildWorkbenchContext(req.workspace, req.workspace, req.mode, req.lane);
      const output = await runner(req);
      const summary = session.toMetrics([
        {
          source: 'manual',
          severity: 'info',
          at: new Date().toISOString(),
          detail: { mode: req.mode, output, lane: req.lane, context },
        },
      ]);
      summaries.push(summary);
      const matrix = buildSignalMatrix(summaryEvents(context), req.workspace);
      void summarizeMatrix(matrix);
      void session;
    }
    return summaries;
  } finally {
    await stack.disposeAsync();
  }
};

export const runWorkbenchSessions = async <TInput extends Record<string, unknown>, TOutput>(
  plans: readonly {
    readonly workspace: string;
    readonly input: TInput;
    readonly mode: WorkspaceMode;
    readonly lane: WorkspaceLane;
  }[],
  runner: (workspace: string, input: TInput, mode: WorkspaceMode, lane: WorkspaceLane) => Promise<TOutput>,
): Promise<readonly NoInfer<WorkspaceSessionMetrics>[]> => {
  return runSessionSeries(
    plans,
    async ({ workspace, input, mode, lane }) => {
      const result = await runner(workspace, input, mode, lane);
      return result;
    },
  );
};

const summaryEvents = (context: { workspace: string; mode: string; lane: string }) =>
  [
    {
      source: 'telemetry',
      severity: 'info',
      at: new Date().toISOString(),
      detail: {
        workspace: context.workspace,
        lane: context.lane,
        mode: context.mode,
      },
    },
  ] as const satisfies readonly SignalEvent[];
