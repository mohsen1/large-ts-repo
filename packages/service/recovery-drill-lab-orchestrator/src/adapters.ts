import type { DrillRunQuery, DrillWorkspacePage } from '@domain/recovery-drill-lab';
import type { DrillLabRunRepository } from '@data/recovery-drill-lab-store';
import { DrillLabOrchestrator } from './runner';

export interface Adapters {
  queryRuns: (query: DrillRunQuery) => ReturnType<DrillLabRunRepository['searchRunEnvelopes']>;
  listWorkspacePage: (limit: number) => DrillWorkspacePage;
  createOrchestrator: (repository: DrillLabRunRepository) => DrillLabOrchestrator;
}

export const createAdapters = (repository: DrillLabRunRepository): Adapters => ({
  queryRuns: (query) => repository.searchRunEnvelopes(query),
  listWorkspacePage: (limit) => repository.buildWorkspacePage({ limit }),
  createOrchestrator: (repo) => new DrillLabOrchestrator(repo),
});

export const normalizeQuery = (input: Partial<DrillRunQuery>): DrillRunQuery => ({
  workspaceId: input.workspaceId,
  scenarioId: input.scenarioId,
  status: input.status,
  from: input.from,
  to: input.to,
  priority: input.priority,
});
