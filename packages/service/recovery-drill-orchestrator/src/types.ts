import type { Result } from '@shared/result';
import type {
  DrillExecutionProfile,
  DrillMode,
  DrillQuery,
  DrillRunContext,
  DrillStatus,
  RecoveryDrillTemplateId,
  RecoveryDrillRunId,
} from '@domain/recovery-drill/src';
import type {
  DrillRunRecord,
  DrillTemplateRecord,
  DrillStoreQuery,
} from '@data/recovery-drill-store/src';

export type DrillProgressStatus = DrillStatus;

export interface DrillProgressEvent {
  runId: RecoveryDrillRunId;
  status: DrillProgressStatus;
  at: string;
  details?: string;
}

export interface RecoveryDrillTemplateStore {
  upsertTemplate(record: DrillTemplateRecord): Promise<DrillTemplateRecord>;
  listTemplates(tenantId: string): Promise<readonly DrillTemplateRecord[]>;
  getTemplate(templateId: RecoveryDrillTemplateId): Promise<DrillTemplateRecord | undefined>;
}

export interface RecoveryDrillRunStore {
  upsertRun(record: DrillRunRecord): Promise<void>;
  getRun(runId: RecoveryDrillRunId): Promise<DrillRunRecord | undefined>;
  listRuns(query: DrillStoreQuery): Promise<{ items: readonly DrillRunRecord[]; total: number; nextCursor?: string }>;
}

export interface DrillNotifier {
  publish(event: DrillProgressEvent): Promise<Result<void, Error>>;
}

export interface DrillDependencies {
  templates: RecoveryDrillTemplateStore;
  runs: RecoveryDrillRunStore;
  notifier: DrillNotifier;
}

export interface DrillStartInput {
  templateId: RecoveryDrillTemplateId;
  initiatedBy: string;
  mode?: DrillMode;
  runAt?: string;
  approvals?: number;
}

export interface DrillRunPlan {
  runId: RecoveryDrillRunId;
  templateId: RecoveryDrillTemplateId;
  scenarioOrder: readonly string[];
  concurrency: number;
  estimatedMs: number;
}

export interface DrillExecutor {
  execute(context: DrillRunContext, plan: DrillRunPlan): Promise<DrillRunRecord>;
}

export interface ActiveRunView extends Omit<DrillRunRecord, 'context'> {
  tenant: string;
  load: number;
  profile: DrillExecutionProfile;
}

export interface DrillCatalogFilter {
  tenant: string;
  mode?: DrillMode;
  status?: DrillQuery['status'];
}
