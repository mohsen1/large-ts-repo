import {
  createMetricWindow,
  isSignal,
  withDefaultPlanWindow,
  type AnalyticsWindow,
  type AnalyticsSession,
  type AnalyticsTenant,
} from '@domain/recovery-ecosystem-analytics';
import {
  type AnalyticsStoreRunRecord,
  type AnalyticsStoreSignalEvent,
  type AnalyticsStore,
  type StoreInsertResult,
  type StoreQueryOptions,
} from './store-contract';
import { fixtureRunRecord, fixtureRecords, defaultWindow } from './fixtures';
import { mapWithIteratorHelpers } from '@shared/type-level';
import type { SignalNamespace } from '@domain/recovery-ecosystem-analytics';
import { parseRunRecord, parseSignalEvent } from './serializer';

const isRunExpired = (startedAt: string, maxAgeMinutes: number): boolean =>
  Date.now() - new Date(startedAt).getTime() > maxAgeMinutes * 60 * 1000;

class WindowScope implements AsyncDisposable {
  readonly #stack = new AsyncDisposableStack();
  readonly #window: AnalyticsWindow;
  #closed = false;

  constructor(window: AnalyticsWindow) {
    this.#window = window;
  }

  get id(): AnalyticsWindow {
    return this.#window;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#stack.disposeAsync();
  }
}

export interface RunInsertInput {
  readonly runId: `run:${string}`;
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
  readonly window?: AnalyticsWindow;
  readonly session?: AnalyticsSession;
}

export interface RunQueryResult {
  readonly run: AnalyticsStoreRunRecord;
  readonly events: readonly AnalyticsStoreSignalEvent[];
}

export class InMemoryAnalyticsRepository implements AnalyticsStore {
  readonly #runs = new Map<string, AnalyticsStoreRunRecord>();
  readonly #events = new Map<string, readonly AnalyticsStoreSignalEvent[]>();
  readonly #windowScopes = new Map<string, WindowScope>();
  readonly #defaultWindow: AnalyticsWindow = defaultWindow;
  #closed = false;

  constructor() {
    this.#runs.set(fixtureRunRecord().runId, fixtureRunRecord());
    this.#events.set(fixtureRunRecord().runId, fixtureRecords());
  }

  async open(input: RunInsertInput): Promise<void> {
    const window = input.window ?? withDefaultPlanWindow(input.tenant, input.namespace.replace('namespace:', ''));
    const session = input.session ?? (`session:${input.runId}` as AnalyticsSession);
    const record: AnalyticsStoreRunRecord = parseRunRecord({
      runId: input.runId,
      tenant: input.tenant,
      namespace: input.namespace,
      window,
      session,
      startedAt: new Date().toISOString(),
      status: 'active',
      stages: [],
      metadata: {
        source: 'service-open',
        mode: 'in-memory',
      },
    });
    this.#runs.set(record.runId, record);
    this.#events.set(record.runId, []);
    this.#windowScopes.set(record.runId, new WindowScope(record.window));
  }

  async close(runId: `run:${string}`): Promise<void> {
    const run = this.#runs.get(runId);
    if (!run) {
      return;
    }
    const completed = new Date().toISOString();
    this.#runs.set(runId, { ...run, status: 'complete', completedAt: completed });
    const scope = this.#windowScopes.get(runId);
    if (scope) {
      await scope[Symbol.asyncDispose]();
      this.#windowScopes.delete(runId);
    }
  }

  async append(event: AnalyticsStoreSignalEvent): Promise<StoreInsertResult> {
    if (!isSignal(event.kind)) {
      throw new Error('invalid signal kind');
    }
    const parsed = parseSignalEvent(event);
    const run = this.#runs.get(event.runId);
    if (!run) {
      throw new Error(`missing run: ${event.runId}`);
    }
    const list = this.#events.get(event.runId) ?? [];
    const next: AnalyticsStoreSignalEvent[] = [...list, parsed];
    this.#events.set(event.runId, next);
    return { inserted: true, eventCount: next.length };
  }

  async appendStage(runId: `run:${string}`, stage: AnalyticsStoreRunRecord['stages'][number]): Promise<void> {
    const run = this.#runs.get(runId);
    if (!run) {
      throw new Error(`missing run: ${runId}`);
    }
    const stages = [...run.stages, stage];
    this.#runs.set(runId, { ...run, stages });
  }

  async read(runId: `run:${string}`): Promise<readonly AnalyticsStoreSignalEvent[]> {
    const records = this.#events.get(runId) ?? [];
    return mapWithIteratorHelpers(records, (entry) => entry);
  }

  async queryRuns(options: StoreQueryOptions = {}): Promise<readonly AnalyticsStoreRunRecord[]> {
    const out: AnalyticsStoreRunRecord[] = [];
    for (const run of this.#runs.values()) {
      if (options.namespace && run.namespace !== options.namespace) continue;
      if (options.tenant && run.tenant !== options.tenant) continue;
      if (options.from && new Date(run.startedAt) < new Date(options.from)) continue;
      if (options.to && new Date(run.startedAt) > new Date(options.to)) continue;
      out.push(run);
    }
    return out.toSorted((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async queryRunWithSignals(runId: `run:${string}`): Promise<RunQueryResult | undefined> {
    const run = this.#runs.get(runId);
    if (!run) return undefined;
    const events = (await this.read(runId)).toSorted((left, right) => right.at.localeCompare(left.at));
    return { run, events };
  }

  async queryRunsForWindow(window: AnalyticsWindow): Promise<readonly AnalyticsStoreRunRecord[]> {
    const runs = await this.queryRuns();
    return runs.filter((run) => run.window === window);
  }

  async queryRecentRuns(ageMinutes = 240): Promise<readonly AnalyticsStoreRunRecord[]> {
    const runs = await this.queryRuns();
    return runs.filter((run) => !isRunExpired(run.startedAt, ageMinutes));
  }

  async hydrateWindow(tenant: AnalyticsTenant): Promise<AnalyticsWindow> {
    const runs = await this.queryRuns({ tenant });
    return runs[0]?.window ?? createMetricWindow('namespace', String(tenant));
  }

  async prune(maxAgeMinutes = 1440): Promise<number> {
    let removed = 0;
    for (const [runId, run] of [...this.#runs.entries()]) {
      if (isRunExpired(run.startedAt, maxAgeMinutes)) {
        this.#runs.delete(runId);
        this.#events.delete(runId);
        removed += 1;
      }
    }
    return removed;
  }

  [Symbol.dispose](): void {
    this.#runs.clear();
    this.#events.clear();
    this.#windowScopes.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const scope of this.#windowScopes.values()) {
      await scope[Symbol.asyncDispose]();
    }
    this.#windowScopes.clear();
    this.#runs.clear();
    this.#events.clear();
  }
}

export const createRepository = (): InMemoryAnalyticsRepository => new InMemoryAnalyticsRepository();
