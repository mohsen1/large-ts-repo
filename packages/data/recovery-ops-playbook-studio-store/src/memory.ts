import { fail, ok, type Result } from '@shared/result';
import { collectTags, matchWorkspace, normalizeRunQuery, summarizeRuns, applySort } from './queries';
import { StudioWorkspaceSchema, type StudioRunRecord, type StudioWorkspace, type StudioArtifact, type StudioLogEntry, type StudioRepository } from './models';
import type { PlaybookExecutionTrace, RunId } from '@domain/recovery-ops-playbook-studio';

interface WorkspaceState {
  readonly tenantId: StudioWorkspace['tenantId'];
  readonly workspaceId: StudioWorkspace['workspaceId'];
  readonly catalog: StudioWorkspace['catalog'];
  runs: Map<RunId, StudioRunRecord>;
  logs: StudioLogEntry[];
  artifacts: Map<RunId, StudioArtifact[]>;
  traces: PlaybookExecutionTrace[];
}

class ScopedRepository {
  readonly #workspaces = new Map<string, WorkspaceState>();

  key(scope: { tenantId: string; workspaceId: string }): string {
    return `${scope.tenantId}::${scope.workspaceId}`;
  }

  getOrCreate(scope: { tenantId: string; workspaceId: string }, catalog: StudioWorkspace['catalog']): WorkspaceState {
    const token = this.key(scope);
    const current = this.#workspaces.get(token);
    if (current) return current;

    const created: WorkspaceState = {
      tenantId: scope.tenantId as WorkspaceState['tenantId'],
      workspaceId: scope.workspaceId as WorkspaceState['workspaceId'],
      catalog,
      runs: new Map(),
      logs: [],
      artifacts: new Map(),
      traces: [],
    };
    this.#workspaces.set(token, created);
    return created;
  }

  listStates(query: {
    tenantId?: string;
    workspaceId?: string;
  }): readonly WorkspaceState[] {
    const states: WorkspaceState[] = [];
    for (const state of this.#workspaces.values()) {
      if (query.tenantId && state.tenantId !== query.tenantId) continue;
      if (query.workspaceId && state.workspaceId !== query.workspaceId) continue;
      states.push(state);
    }
    return states;
  }
}

class RunCatalog {
  readonly #index = new Map<RunId, WorkspaceState>();

  bind(runId: RunId, state: WorkspaceState): void {
    this.#index.set(runId, state);
  }

  resolve(runId: RunId): WorkspaceState | undefined {
    return this.#index.get(runId);
  }

  drop(runId: RunId): void {
    this.#index.delete(runId);
  }

  findByWorkspace(state: WorkspaceState): readonly RunId[] {
    const runIds: RunId[] = [];
    for (const [runId, workspace] of this.#index.entries()) {
      if (workspace === state) {
        runIds.push(runId);
      }
    }
    return runIds;
  }
}

const parseWorkspaceRunTuple = (runId: RunId): [string, string, string] => {
  const [tenantId, workspaceId, unique] = String(runId).split('::');
  return [tenantId ?? '', workspaceId ?? '', unique ?? ''];
};

export class InMemoryPlaybookStudioStore implements StudioRepository {
  readonly #scope = new ScopedRepository();
  readonly #catalogs = new Map<string, StudioWorkspace['catalog']>();
  readonly #runCatalog = new RunCatalog();

  async seedWorkspace(workspace: StudioWorkspace): Promise<Result<void, string>> {
    const parsed = StudioWorkspaceSchema.safeParse(workspace);
    if (!parsed.success) {
      return fail(parsed.error.issues.at(0)?.message ?? 'invalid-workspace');
    }
    this.#scope.getOrCreate(parsed.data, parsed.data.catalog);
    this.#catalogs.set(`${parsed.data.tenantId}::${parsed.data.workspaceId}`, parsed.data.catalog);
    return ok(undefined);
  }

  async saveRun(run: StudioRunRecord): Promise<Result<void, string>> {
    const state = this.#scope.getOrCreate({ tenantId: run.tenantId, workspaceId: run.workspaceId }, {
      namespace: 'playbook:default' as StudioWorkspace['catalog']['namespace'],
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      entries: [],
    } as StudioWorkspace['catalog']);
    state.runs.set(run.runId, run);
    this.#runCatalog.bind(run.runId, state);
    return ok(undefined);
  }

  async getRun(runId: RunId): Promise<Result<StudioRunRecord | undefined, string>> {
    const state = this.#runCatalog.resolve(runId);
    if (!state) {
      return ok(undefined);
    }
    return ok(state.runs.get(runId));
  }

  async appendLog(entry: StudioLogEntry): Promise<Result<void, string>> {
    const state = this.resolveScope(entry.runId);
    if (!state) return fail('run-not-found');
    state.logs.push(entry);
    state.logs.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
    return ok(undefined);
  }

  async listRuns(query: {
    tenantId?: string;
    workspaceId?: string;
    includeArchived?: boolean;
    tagPrefix?: string;
    limit?: number;
  }): Promise<Result<readonly StudioRunRecord[], string>> {
    const normalized = normalizeRunQuery(query);
    const payload = this.#scope
      .listStates(query)
      .flatMap((state) => [...state.runs.values()])
      .filter((run) => matchWorkspace(run, {
        tenantId: normalized.tenantId,
        workspaceId: normalized.workspaceId,
        tagPrefix: normalized.tagPrefix,
      }))
      .filter((run) => normalized.includeArchived || run.status !== 'failed')
      .toSorted((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));

    const sorted = applySort(payload, { by: 'started', direction: 'desc' });
    return ok(sorted.slice(0, normalized.limit));
  }

  async listLogs(runId: RunId, limit = 250): Promise<Result<readonly StudioLogEntry[], string>> {
    const state = this.#runCatalog.resolve(runId);
    if (!state) return fail('run-not-found');
    const byRun = state.logs.filter((entry) => entry.runId === runId);
    return ok(byRun.toSorted((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, Math.max(1, limit)));
  }

  async saveArtifacts(runId: RunId, artifacts: readonly StudioArtifact[]): Promise<Result<void, string>> {
    const state = this.#runCatalog.resolve(runId);
    if (!state) return fail('run-not-found');
    const merged = state.artifacts.get(runId) ?? [];
    state.artifacts.set(runId, [...merged, ...artifacts]);
    return ok(undefined);
  }

  async listArtifacts(runId: RunId): Promise<Result<readonly StudioArtifact[], string>> {
    const state = this.#runCatalog.resolve(runId);
    if (!state) return ok([]);
    return ok([...(state.artifacts.get(runId) ?? [])]);
  }

  async saveTrace(trace: PlaybookExecutionTrace): Promise<Result<void, string>> {
    const [tenantId, workspaceId] = trace.runId.split('::');
    if (!tenantId || !workspaceId) {
      return fail('run-not-found');
    }
    const state = this.#scope.listStates({ tenantId, workspaceId })[0]
      ?? this.#scope.getOrCreate({ tenantId, workspaceId }, this.#catalogs.get(`${tenantId}::${workspaceId}`) ?? {
        namespace: 'playbook:default' as StudioWorkspace['catalog']['namespace'],
        tenantId: tenantId as StudioWorkspace['tenantId'],
        workspaceId: workspaceId as StudioWorkspace['workspaceId'],
        entries: [],
      } as StudioWorkspace['catalog']);
    state.traces.push(trace);
    return ok(undefined);
  }

  async streamTraces(runId: RunId): Promise<Result<AsyncIterable<PlaybookExecutionTrace>, string>> {
    const state = this.#runCatalog.resolve(runId);
    if (!state) return fail('run-not-found');
    const sorted = [...state.traces].toSorted((left, right) => right.totals.elapsedMs - left.totals.elapsedMs);
    const iterator = (async function* () {
      for (const trace of sorted) {
        yield trace;
      }
    })();

    return ok(iterator);
  }

  async close(): Promise<void> {
    for (const state of this.#scope.listStates({})) {
      state.runs.clear();
      state.logs.length = 0;
      state.artifacts.clear();
      state.traces.length = 0;
    }
    this.#catalogs.clear();
  }

  private resolveScope(runId: RunId): WorkspaceState | undefined {
    const state = this.#runCatalog.resolve(runId);
    if (state) return state;

    const [tenantId, workspaceId] = parseWorkspaceRunTuple(runId);
    if (!tenantId || !workspaceId) return undefined;
    return this.#scope.listStates({ tenantId, workspaceId })[0];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  debug(): {
    byTenant: ReturnType<typeof summarizeRuns>;
    tags: readonly string[];
  } {
    const runs = this.#scope.listStates({}).flatMap((state) => [...state.runs.values()]);
    const tags = collectTags(runs);
    return {
      byTenant: summarizeRuns(runs),
      tags,
    };
  }
}

export const createInMemoryStore = (): InMemoryPlaybookStudioStore => new InMemoryPlaybookStudioStore();
