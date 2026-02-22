import type { DrillTemplateRecord, DrillRunRecord, DrillListResult } from './models';
import { summarizeTemplates } from './repository';
import { matchesRunQuery, paginate } from './queries';
import { withBrand } from '@shared/core';
import type { RecoveryDrillTemplateId, RecoveryDrillRunId, RecoveryDrillTenantId } from '@domain/recovery-drill/src';

export interface IngestionError {
  readonly source: string;
  readonly message: string;
}

export interface IngestionSummary {
  readonly source: string;
  readonly processedTemplates: number;
  readonly processedRuns: number;
  readonly warnings: readonly string[];
  readonly errors: readonly IngestionError[];
}

interface InboundTemplatePayload {
  readonly templateId: string;
  readonly payload: unknown;
}

interface InboundRunPayload {
  readonly runId: string;
  readonly payload: unknown;
}

const coerceTemplate = (incoming: InboundTemplatePayload): DrillTemplateRecord | undefined => {
  const record = incoming.payload as Partial<DrillTemplateRecord>;
  if (!record.templateId || record.templateId !== incoming.templateId) return;
  if (!record.template || !record.tenantId) return;
  return {
    templateId: withBrand(record.templateId, 'RecoveryDrillTemplateId') as RecoveryDrillTemplateId,
    tenantId: withBrand(record.tenantId as never, 'TenantId') as RecoveryDrillTenantId,
    template: record.template,
    archived: Boolean(record.archived),
    createdAt: record.createdAt ?? new Date().toISOString(),
  };
};

const coerceRun = (incoming: InboundRunPayload): DrillRunRecord | undefined => {
  const record = incoming.payload as Partial<DrillRunRecord>;
  if (!record.id || incoming.runId !== record.id) return;
  if (!record.templateId || !record.mode) return;
  return {
    id: withBrand(record.id, 'RecoveryDrillRunId') as RecoveryDrillRunId,
    templateId: withBrand(record.templateId, 'RecoveryDrillTemplateId') as RecoveryDrillTemplateId,
    status: record.status ?? 'planned',
    mode: record.mode,
    profile: record.profile ?? {
      runId: withBrand(incoming.runId, 'RecoveryDrillRunId') as never,
      elapsedMs: 0,
      estimatedMs: 0,
      queueDepth: 0,
      successRate: 0,
    },
    checkpoints: record.checkpoints ?? [],
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    plan: record.plan,
    context: record.context,
  };
};

export const ingestTemplates = (payloads: readonly InboundTemplatePayload[]): {
  readonly records: readonly DrillTemplateRecord[];
  readonly summary: IngestionSummary;
} => {
  const warnings: string[] = [];
  const errors: IngestionError[] = [];
  const records: DrillTemplateRecord[] = [];

  for (const payload of payloads) {
    const record = coerceTemplate(payload);
    if (!record) {
      errors.push({ source: payload.templateId, message: 'invalid-template' });
      continue;
    }
    records.push(record);
  }

  if (records.length === 0) {
    warnings.push('no-valid-templates');
  }

  return {
    records,
    summary: {
      source: 'template-ingest',
      processedTemplates: records.length,
      processedRuns: 0,
      warnings,
      errors,
    },
  };
};

export const ingestRuns = (payloads: readonly InboundRunPayload[]): {
  readonly records: readonly DrillRunRecord[];
  readonly summary: IngestionSummary;
} => {
  const warnings: string[] = [];
  const errors: IngestionError[] = [];
  const records: DrillRunRecord[] = [];

  for (const payload of payloads) {
    const record = coerceRun(payload);
    if (!record) {
      errors.push({ source: payload.runId, message: 'invalid-run' });
      continue;
    }
    records.push(record);
  }

  if (records.length === 0) {
    warnings.push('no-valid-runs');
  }

  return {
    records,
    summary: {
      source: 'run-ingest',
      processedTemplates: 0,
      processedRuns: records.length,
      warnings,
      errors,
    },
  };
};

export const projectByTenant = (
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
  tenant: string,
): {
  templates: string;
  runList: DrillListResult;
  dump: string;
} => {
  const selectedTemplates = templates.filter((item) => item.tenantId === tenant);
  const templateIds = selectedTemplates.map((item) => item.templateId);
  const list = runs
    .filter((run) => templateIds.includes(run.templateId))
    .filter((run) => matchesRunQuery({ status: undefined, from: undefined, to: undefined }, run))
    .map((run) => run)
    .sort((left, right) => (left.startedAt ?? '').localeCompare(right.startedAt ?? ''));

  const runList = paginate(list, undefined, 200);

  return {
    templates: summarizeTemplates(selectedTemplates),
    runList,
    dump: JSON.stringify({ tenant, templates: selectedTemplates, runs: list }),
  };
};
