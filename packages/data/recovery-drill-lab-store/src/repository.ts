import {
  type DrillLabRunId,
  type DrillRunSnapshot,
  type DrillWorkspace,
  type DrillScenario,
  type DrillRunQuery,
  type DrillWorkspacePage,
  type DrillWorkspacePageArgs,
  createRunId,
} from '@domain/recovery-drill-lab';
import { RunSearchResult, makeRunEnvelope, isRunQueryEnvelope, type RunQueryEnvelope } from './models';
import { runMatchesQuery, paginateRunEnvelopes, summarizeRunsByWorkspace, summarizeRunsByScenario } from './query';

export class DrillLabRunRepository {
  private readonly runs = new Map<DrillLabRunId, DrillRunSnapshot>();
  private readonly workspaces = new Map<string, DrillWorkspace>();
  private readonly scenarios = new Map<string, DrillScenario>();

  saveWorkspace(workspace: DrillWorkspace): void {
    this.workspaces.set(workspace.id, workspace);
  }

  saveScenario(scenario: DrillScenario): void {
    this.scenarios.set(scenario.id, scenario);
  }

  saveRun(run: DrillRunSnapshot): void {
    this.runs.set(run.id, run);
  }

  listRuns(query: DrillRunQuery): readonly DrillRunSnapshot[] {
    return [...this.runs.values()].filter((run) => runMatchesQuery(run, query));
  }

  findRun(runId: DrillLabRunId): DrillRunSnapshot | undefined {
    return this.runs.get(runId);
  }

  searchRunEnvelopes(query: DrillRunQuery, request: RunQueryEnvelope = {}): RunSearchResult {
    const envelopes = [...this.runs.values()].map((run) => makeRunEnvelope(run));
    const normalized = isRunQueryEnvelope(request)
      ? { ...request, limit: request.limit !== undefined ? Math.max(1, request.limit) : undefined }
      : { limit: 30 };
    return {
      ...paginateRunEnvelopes(envelopes, query, normalized.limit, normalized.cursor),
      requestId: createRunId('request-run-search'),
    };
  }

  buildWorkspacePage(args: DrillWorkspacePageArgs): DrillWorkspacePage {
    const all = [...this.workspaces.values()];
    const limit = Math.max(1, args.limit);
    const start = args.cursor ? all.findIndex((entry) => entry.id === args.cursor) + 1 : 0;
    const sorted = [...all].sort((left, right) => left.id.localeCompare(right.id));
    const pageItems = sorted.slice(start, start + limit);
    const nextCursor = pageItems.length > 0 ? pageItems[pageItems.length - 1]?.id : undefined;

    return {
      page: {
        items: pageItems,
        hasMore: start + pageItems.length < sorted.length,
        nextCursor,
      },
    };
  }

  countRunsByWorkspace(): Map<string, number> {
    const envelopes = [...this.runs.values()].map((run) => makeRunEnvelope(run));
    return summarizeRunsByWorkspace(envelopes);
  }

  countRunsByScenario(): Map<string, number> {
    const envelopes = [...this.runs.values()].map((run) => makeRunEnvelope(run));
    return summarizeRunsByScenario(envelopes);
  }

  removeOld(before: string): StoreMutationResult<DrillRunSnapshot> {
    const removed: DrillRunSnapshot[] = [];
    for (const [id, run] of this.runs.entries()) {
      if (run.updatedAt < before) {
        this.runs.delete(id);
        removed.push(run);
      }
    }
    return {
      inserted: 0,
      removed: removed.length,
      payload: removed,
    };
  }
}

export { makeRunEnvelope, isRunQueryEnvelope };
export const createRepository = (): DrillLabRunRepository => new DrillLabRunRepository();

export interface StoreMutationResult<T> {
  readonly inserted: number;
  readonly removed: number;
  readonly payload: readonly T[];
}
