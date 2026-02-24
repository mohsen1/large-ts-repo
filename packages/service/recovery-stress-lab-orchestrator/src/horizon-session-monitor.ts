import { type Brand, type HorizonIdentity, type StageChain } from '@domain/recovery-stress-lab';
import { HorizonIncidentProjectionStore } from '@data/recovery-incident-lab-store/src/horizon-incident-projections';
import {
  type EngineRunSummary,
  createHorizonExecutionEngine,
  type StageEvent,
  summarizeRun,
} from './horizon-execution-engine';
import { err, ok, type Result } from '@shared/result';

interface MonitorSession {
  readonly identity: HorizonIdentity;
  readonly templateId: string;
  readonly startedAt: string;
  readonly activeRuns: number;
  readonly history: readonly string[];
}

export interface SessionMonitorOptions {
  readonly identity: HorizonIdentity;
  readonly templateId: string;
  readonly template: Parameters<typeof createHorizonExecutionEngine>[0]['template'];
}

export type SessionState = {
  readonly identity: HorizonIdentity;
  readonly template: string;
  readonly startedAt: string;
  readonly lastRun: string | null;
  readonly runs: readonly string[];
  readonly route: StageChain;
};

const monitorRoute = 'sense/assess/plan/simulate/approve/execute/verify/close' as StageChain;

const formatEvent = (identity: HorizonIdentity, event: string): string =>
  `${identity.ids.scenario}:${identity.ids.workspace}:${event}`;

export class HorizonSessionMonitor {
  readonly #store = new HorizonIncidentProjectionStore();
  readonly #runs = new Map<string, string[]>();
  readonly #sessions = new Map<string, MonitorSession>();
  readonly #stack = new AsyncDisposableStack();

  constructor() {
    this.#stack.defer(async () => {
      this.#runs.clear();
      this.#sessions.clear();
    });
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#stack.disposeAsync();
  }

  openSession(options: SessionMonitorOptions): Result<SessionState> {
    const sessionKey = `${options.identity.ids.session}`;
    const existing = this.#sessions.get(sessionKey);
    if (existing) {
      return ok({
        identity: options.identity,
        template: existing.templateId,
        startedAt: existing.startedAt,
        lastRun: existing.history.at(-1) ?? null,
        runs: existing.history,
        route: monitorRoute,
      });
    }

    const session: MonitorSession = {
      identity: options.identity,
      templateId: options.templateId,
      startedAt: new Date().toISOString(),
      activeRuns: 0,
      history: [],
    };
    this.#sessions.set(sessionKey, session);
    this.#runs.set(sessionKey, []);

    return ok({
      identity: options.identity,
      template: options.template.templateId,
      startedAt: session.startedAt,
      lastRun: null,
      runs: [],
      route: monitorRoute,
    });
  }

  async run<TInput>(options: SessionMonitorOptions, payload: TInput): Promise<Result<EngineRunSummary>> {
    const sessionKey = `${options.identity.ids.session}`;
    const session = this.#sessions.get(sessionKey);
    if (!session) {
      return err(new Error(`session not opened: ${sessionKey}`));
    }

    const run = createHorizonExecutionEngine({
      identity: options.identity,
      template: options.template,
      tenant: 'horizon-monitor',
      payload,
    });

    this.#sessions.set(sessionKey, {
      ...session,
      activeRuns: session.activeRuns + 1,
      history: [...session.history],
    });

    const result = await run.run();
    await run[Symbol.asyncDispose]();

    const updated = this.#sessions.get(sessionKey);
    if (!updated) {
      return err(new Error(`session not retained: ${sessionKey}`));
    }

    if (!result.ok) {
      this.#sessions.set(sessionKey, {
        ...updated,
        activeRuns: Math.max(0, updated.activeRuns - 1),
      });
      return err(result.error);
    }

    const history = [...(this.#runs.get(sessionKey) ?? []), summarizeRun(result.value)];
    this.#runs.set(sessionKey, history);
    this.#sessions.set(sessionKey, {
      ...updated,
      activeRuns: Math.max(0, updated.activeRuns - 1),
      history,
    });

    return ok(result.value);
  }

  listSessions(): readonly SessionState[] {
    const out: SessionState[] = [];
    for (const value of this.#sessions.values()) {
      out.push({
        identity: value.identity,
        template: value.templateId,
        startedAt: value.startedAt,
        lastRun: value.history.at(-1) ?? null,
        runs: value.history,
        route: monitorRoute,
      });
    }
    return out;
  }

  async timeline(identity: HorizonIdentity): Promise<readonly string[]> {
    const session = this.#sessions.get(`${identity.ids.session}`);
    if (!session) {
      return [];
    }

    const projectionState = await this.#store.snapshotState(identity.ids.workspace);
    const history = this.#runs.get(identity.ids.session) ?? [];
    const projectionLine = projectionState.ok
      ? summarizeRun({
          state: {
            tenant: 'horizon-monitor',
            workspaceId: identity.ids.workspace,
            runId: `${identity.ids.session}-snapshot` as Brand<string, 'HorizonRunId'>,
            route: projectionState.value.route,
            startedAt: new Date().toISOString(),
            stage: 'sense',
          },
          timeline: [
            {
              timestamp: new Date().toISOString(),
              stage: 'sense',
              pluginId: 'monitor',
              durationMs: 0,
              output: projectionState.value.route,
            } as StageEvent,
          ],
          snapshots: [],
          stageCount: 8,
        })
      : null;

    return projectionLine
      ? [...history.map((entry) => formatEvent(identity, entry)), formatEvent(identity, projectionLine)]
      : history.map((entry) => formatEvent(identity, entry));
  }
}

export const createHorizonSessionMonitor = (): HorizonSessionMonitor => new HorizonSessionMonitor();
