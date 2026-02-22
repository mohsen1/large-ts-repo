import type { DrillRunRecord, DrillTemplateRecord, DrillStoreQuery, DrillListResult } from './models';
import { matchesRunQuery } from './queries';

export interface DrillSignal {
  readonly signalId: string;
  readonly templateId: string;
  readonly runId: string;
  readonly at: string;
  readonly status: string;
  readonly message: string;
}

export interface SignalIndex {
  readonly signals: ReadonlyMap<string, DrillSignal[]>;
  readonly byTemplate: ReadonlyMap<string, DrillSignal[]>;
}

export interface IndexedResult {
  readonly templates: ReadonlyMap<string, DrillTemplateRecord>;
  readonly runs: ReadonlyMap<string, DrillRunRecord>;
  readonly signalIndex: SignalIndex;
}

const collectSignals = (run: DrillRunRecord): readonly DrillSignal[] => {
  if (run.checkpoints.length === 0) {
    return [
      {
        signalId: `${run.id}-empty`,
        templateId: run.templateId,
        runId: run.id,
        at: run.endedAt ?? run.startedAt ?? new Date().toISOString(),
        status: run.status,
        message: 'run-created',
      },
    ];
  }
  return run.checkpoints.map((checkpoint) => ({
    signalId: `${run.id}-${checkpoint}`,
    templateId: run.templateId,
    runId: run.id,
    at: run.endedAt ?? new Date().toISOString(),
    status: run.status,
    message: checkpoint,
  }));
};

export const buildIndexes = (templates: readonly DrillTemplateRecord[], runs: readonly DrillRunRecord[]): IndexedResult => {
  const templateMap = new Map<string, DrillTemplateRecord>();
  for (const template of templates) {
    templateMap.set(template.templateId, template);
  }

  const runMap = new Map<string, DrillRunRecord>();
  const byTemplate = new Map<string, DrillSignal[]>();
  const allSignals: DrillSignal[] = [];

  for (const run of runs) {
    runMap.set(run.id, run);
    const signals = collectSignals(run);
    allSignals.push(...signals);
    const existing = byTemplate.get(run.templateId) ?? [];
    byTemplate.set(run.templateId, [...existing, ...signals]);
  }

  const signalsByTemplate = new Map<string, DrillSignal[]>();
  for (const [templateId, entries] of byTemplate) {
    signalsByTemplate.set(
      templateId,
      entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 256),
    );
  }

  return {
    templates: templateMap,
    runs: runMap,
    signalIndex: {
      signals: new Map(
        byTemplate,
      ),
      byTemplate: signalsByTemplate,
    },
  };
};

const queryTemplateSignals = (
  templateId: string,
  index: IndexedResult,
): readonly DrillSignal[] => index.signalIndex.byTemplate.get(templateId) ?? [];

export const findSignalsByTenant = (
  tenantId: string,
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
): readonly DrillSignal[] => {
  const index = buildIndexes(templates, runs);
  const matches = templates.filter((item) => item.tenantId === tenantId);
  const grouped = matches.flatMap((match) => queryTemplateSignals(match.templateId, index));
  return grouped.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
};

export const projectRunList = (
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
  query: Pick<DrillStoreQuery, 'tenant' | 'status'>,
): DrillListResult => {
  const tenantTemplates = templates.filter((template) => !query.tenant || template.tenantId === query.tenant);
  const filteredRuns = runs
    .filter((run) => matchesRunQuery(query, run))
    .filter((run) => !query.status || query.status.includes(run.status))
    .filter((run) => tenantTemplates.some((template) => template.templateId === run.templateId));

  const items = filteredRuns.sort((left, right) => (left.startedAt ?? '').localeCompare(right.startedAt ?? ''));
  return {
    items,
    total: items.length,
    nextCursor: undefined,
  };
};
