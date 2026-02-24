import { withBrand } from '@shared/core';
import { InMemoryRepository, VersionedRepository } from '@data/repositories';
import {
  ContinuitySummary,
  ContinuitySessionId,
  ContinuityExecutionTrace,
  ContinuityWorkspace,
  buildContinuitySessionId,
  ContinuityExecutionWindow,
  type ContinuityTemplate,
} from '@domain/recovery-incident-workflows';
import type {
  WorkflowStoreRecord,
  WorkflowRunRecord,
} from '../types';

type WorkspaceEnvelope<T> = readonly [T] | readonly [T, T];

interface WorkspaceRow {
  readonly id: ContinuitySessionId;
  readonly workspace: ContinuityWorkspace;
  readonly trace?: ContinuityExecutionTrace;
  readonly summary: ContinuitySummary;
  readonly createdAt: string;
}

export class ContinuityWorkspaceStore implements AsyncDisposable {
  private readonly byId = new InMemoryRepository<ContinuitySessionId, WorkspaceRow>((row) => row.id);
  private readonly versions = new VersionedRepository<ContinuitySessionId, ContinuityWorkspace>((workspace) => workspace.id);

  async create(sessionId: ContinuitySessionId, workspace: ContinuityWorkspace): Promise<ContinuityWorkspace> {
    const summary: ContinuitySummary = {
      sessionId,
      score: workspace.templates.length,
      status: workspace.templates.length === 0 ? 'queued' : 'running',
      policy: workspace.templates[0]?.policy ?? {
        enforceSla: true,
        minReadiness: 0.3,
        maxParallelism: 2,
        clauses: [{ name: 'default', weight: 1, windowMinutes: 10 }],
        allowAsyncRollback: false,
      },
      tags: [workspace.tenant],
    };

    await this.byId.save({
      id: sessionId,
      workspace,
      summary,
      createdAt: new Date().toISOString(),
    });

    await this.versions.save(workspace);
    return workspace;
  }

  async list(
    filter: (workspace: ContinuityWorkspace) => boolean = () => true,
  ): Promise<readonly ContinuityWorkspace[]> {
    const all = await this.byId.all();
    return all
      .filter((entry) => filter(entry.workspace))
      .map((entry) => entry.workspace)
      .sort((left, right) => right.tenant.localeCompare(left.tenant));
  }

  async find(sessionId: ContinuitySessionId): Promise<ContinuityWorkspace | undefined> {
    const row = await this.byId.findById(sessionId);
    return row?.workspace;
  }

  async attachTrace(sessionId: ContinuitySessionId, trace: ContinuityExecutionTrace): Promise<void> {
    const row = await this.byId.findById(sessionId);
    if (!row) {
      return;
    }

    await this.byId.save({
      ...row,
      trace,
    });
  }

  async remove(sessionId: ContinuitySessionId): Promise<void> {
    await this.byId.deleteById(sessionId);
  }

  async snapshot(records: readonly WorkflowStoreRecord[]): Promise<number> {
    return records.reduce((acc, record) => acc + record.template.route.nodes.length, 0);
  }

  async buildHistory(sessionId: ContinuitySessionId, runs: readonly WorkflowRunRecord[]): Promise<readonly ContinuityExecutionWindow[]> {
    const workspace = await this.find(sessionId);
    if (!workspace) {
      return [];
    }

    return runs.flatMap((run) => {
      const template = workspace.templates.find((candidate) => String(candidate.id) === String(run.instanceId));
      if (!template) {
        return [];
      }

      return {
        startedAt: run.run.startedAt,
        endedAt: run.run.finishedAt,
        runs: [
          {
            nodeId: String(run.run.nodeId),
            output: { run: String(run.run.id), result: run.run.result },
            success: run.run.result === 'success',
            diagnostics: ['from-run-history'],
          },
        ],
        signal: template.policy.minReadiness,
      } as ContinuityExecutionWindow;
    });
  }

  async *iterActiveWindows(windowMinutes = 30): AsyncGenerator<WorkspaceEnvelope<WorkspaceRow>> {
    const rows = await this.byId.all();
    const byWindow = new Map<string, WorkspaceRow[]>();

    const now = Date.now();
    const divisor = Math.max(1, windowMinutes) * 60_000;
    for (const row of rows) {
      const elapsed = now - Date.parse(row.createdAt);
      const windowKey = String(Math.floor(elapsed / divisor));
      const values = byWindow.get(windowKey) ?? [];
      values.push(row);
      byWindow.set(windowKey, values);
    }

    for (const value of byWindow.values()) {
      const tuple = value[1] ? [value[0], value[1]] as readonly [WorkspaceRow, WorkspaceRow]
        : [value[0]] as const;
      yield tuple;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const rows = await this.byId.all();
    await Promise.all(rows.map((row) => this.byId.deleteById(row.id)));
  }
}

export const createContinuityWorkspace = (
  tenant: string,
  sessionId: string,
  templates: readonly ContinuityTemplate[],
): ContinuityWorkspace => ({
  id: buildContinuitySessionId(tenant, sessionId),
  tenant,
  incidentId: templates[0]?.incidentId ?? withBrand(`${tenant}:incident`, 'IncidentId'),
  templates,
  labels: {
    tenant,
    count: String(templates.length),
  },
  riskBand: templates.length > 0 ? templates[0]!.metadata.riskBand : 'low',
});

export const createContinuityStore = (tenant: string, sessionTag: string): ContinuitySessionId =>
  buildContinuitySessionId(tenant, sessionTag);

export const createWindow = (seed: string): ContinuityExecutionWindow[] => [{
  startedAt: seed,
  endedAt: seed,
  runs: [],
  signal: 0,
}];

export const estimateWorkspaceLoad = (workspace: ContinuityWorkspace): number => {
  const templateLoad = workspace.templates.reduce((acc, template) => acc + template.nodes.length, 0);
  return templateLoad + workspace.templates.length;
};

export const classifyWorkspaceTemplates = (template: ContinuityTemplate): 'fresh' | 'stable' => {
  const now = Date.now();
  return now - Date.parse(template.updatedAt) < 60 * 60 * 1000 ? 'fresh' : 'stable';
};

export const pickWorkspaceTemplates = (
  templates: readonly ContinuityTemplate[],
  includeTag: (tag: string) => boolean,
): readonly ContinuityTemplate[] => templates.filter((template) => template.tags.some((tag) => includeTag(tag)));
