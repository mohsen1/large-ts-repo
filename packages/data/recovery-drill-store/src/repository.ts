import { fail, ok, type Result } from '@shared/result';
import type {
  DrillRunRecord,
  DrillTemplateRecord,
  DrillListResult,
  DrillStoreQuery,
  StoreMutationReport,
} from './models';
import type {
  RecoveryDrillRunId,
  RecoveryDrillTemplateId,
  RecoveryDrillTenantId,
  DrillStatus,
} from '@domain/recovery-drill/src';
import { matchesTemplateQuery, matchesRunQuery, paginate, flattenTemplateKeys } from './queries';

export interface RecoveryDrillTemplateRepository {
  upsertTemplate(record: DrillTemplateRecord): Promise<DrillTemplateRecord>;
  listTemplates(tenantId: RecoveryDrillTenantId): Promise<readonly DrillTemplateRecord[]>;
  getTemplate(templateId: RecoveryDrillTemplateId): Promise<DrillTemplateRecord | undefined>;
}

export interface RecoveryDrillRunRepository {
  upsertRun(record: DrillRunRecord): Promise<void>;
  getRun(runId: RecoveryDrillRunId): Promise<DrillRunRecord | undefined>;
  findRuns(query: DrillStoreQuery): Promise<DrillListResult>;
  listByTemplate(templateId: RecoveryDrillTemplateId): Promise<readonly DrillRunRecord[]>;
}

export interface RecoveryDrillStore {
  templates: RecoveryDrillTemplateRepository;
  runs: RecoveryDrillRunRepository;
}

class TemplateRepository implements RecoveryDrillTemplateRepository {
  private readonly templates = new Map<string, DrillTemplateRecord>();

  async upsertTemplate(record: DrillTemplateRecord): Promise<DrillTemplateRecord> {
    this.templates.set(record.templateId, record);
    return record;
  }

  async listTemplates(tenantId: RecoveryDrillTenantId): Promise<readonly DrillTemplateRecord[]> {
    return Array.from(this.templates.values()).filter((template) => template.tenantId === tenantId);
  }

  async getTemplate(templateId: RecoveryDrillTemplateId): Promise<DrillTemplateRecord | undefined> {
    return this.templates.get(templateId);
  }
}

class RunRepository implements RecoveryDrillRunRepository {
  private readonly runs = new Map<string, DrillRunRecord>();

  async upsertRun(record: DrillRunRecord): Promise<void> {
    this.runs.set(record.id, record);
  }

  async getRun(runId: RecoveryDrillRunId): Promise<DrillRunRecord | undefined> {
    return this.runs.get(runId);
  }

  async findRuns(query: DrillStoreQuery): Promise<DrillListResult> {
    const selectedTemplates = Array.from(this.runs.values())
      .filter((run) => {
        if (query.status && query.status.length > 0 && !query.status.includes(run.status)) return false;
        return matchesRunQuery(query, run);
      })
      .filter((run) => {
        const hasTemplateMatch = query.templateIds ? query.templateIds.includes(run.templateId) : true;
        if (!hasTemplateMatch) return false;
        return true;
      });
    const items = selectedTemplates.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
    return paginate(items, undefined, 25);
  }

  async listByTemplate(templateId: RecoveryDrillTemplateId): Promise<readonly DrillRunRecord[]> {
    return Array.from(this.runs.values()).filter((run) => run.templateId === templateId);
  }
}

export class InMemoryRecoveryDrillStore implements RecoveryDrillStore {
  templates = new TemplateRepository();
  runs = new RunRepository();
}

export const summarizeMutation = (
  templateWrites: number,
  runWrites: number,
  errors: readonly Error[],
): Result<StoreMutationReport, Error> => {
  if (errors.length > 0) {
    return fail(errors[0]);
  }
  return ok({
    writtenTemplates: templateWrites,
    updatedRuns: runWrites,
    checkpointWrites: 0,
    errors: [],
  });
};

export const summarizeTemplates = (templates: readonly DrillTemplateRecord[]): string => flattenTemplateKeys(templates);
