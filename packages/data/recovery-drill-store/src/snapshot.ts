import { buildIndexes, type IndexedResult } from './signal-index';
import type { DrillRunRecord, DrillTemplateRecord } from './models';
import { summarizeMutation } from './repository';

export interface DrillStoreSnapshotRow {
  readonly templateId: string;
  readonly templateTitle: string;
  readonly runCount: number;
  readonly lastRunStatus: string;
  readonly activeRuns: number;
}

export interface DrillStoreSnapshot {
  readonly tenantId: string;
  readonly rows: readonly DrillStoreSnapshotRow[];
  readonly totalTemplates: number;
  readonly totalRuns: number;
  readonly createdAt: string;
}

export interface SnapshotMutation {
  readonly templateWrites: number;
  readonly runWrites: number;
  readonly signalWrites: number;
}

const summarizeRow = (template: DrillTemplateRecord, runs: readonly DrillRunRecord[]) => {
  const relatedRuns = runs.filter((run) => run.templateId === template.templateId);
  const activeRuns = relatedRuns.filter((run) => run.status === 'running' || run.status === 'queued' || run.status === 'paused').length;
  const lastRunStatus = relatedRuns.at(-1)?.status ?? 'unknown';
  return {
    templateId: template.templateId,
    templateTitle: template.template.title,
    runCount: relatedRuns.length,
    lastRunStatus,
    activeRuns,
  };
};

export const snapshotFromData = (tenantId: string, templates: readonly DrillTemplateRecord[], runs: readonly DrillRunRecord[]): DrillStoreSnapshot => {
  const tenantTemplates = templates.filter((template) => template.tenantId === tenantId);
  const rows = tenantTemplates.map((template) => summarizeRow(template, runs)).sort((left, right) => right.runCount - left.runCount);
  const totalRuns = runs.filter((run) => tenantTemplates.some((template) => template.templateId === run.templateId)).length;

  return {
    tenantId,
    rows,
    totalTemplates: tenantTemplates.length,
    totalRuns,
    createdAt: new Date().toISOString(),
  };
};

export const mutateAndSnapshot = async (
  runWriter: (run: DrillRunRecord[]) => Promise<void>,
  templateWriter: (template: DrillTemplateRecord[]) => Promise<void>,
  templates: DrillTemplateRecord[],
  runs: DrillRunRecord[],
): Promise<DrillStoreSnapshot> => {
  const templateWrites = templates.length;
  const runWrites = runs.length;
  const index = buildIndexes(templates, runs);
  const signalWrites = Array.from(index.signalIndex.byTemplate.values()).reduce((sum, signals) => sum + signals.length, 0);

  await Promise.all([
    templateWriter(templates),
    runWriter(runs),
  ]);

  const report = summarizeMutation(templateWrites, runWrites, []);
  if (!report.ok) {
    return {
      tenantId: 'unknown',
      rows: [],
      totalTemplates: 0,
      totalRuns: 0,
      createdAt: new Date().toISOString(),
    };
  }

  const tenantIds = Array.from(new Set(templates.map((template) => template.tenantId)));
  const selectedTenant = tenantIds[0] ?? 'global';
  return snapshotFromData(selectedTenant, templates, runs);
};
