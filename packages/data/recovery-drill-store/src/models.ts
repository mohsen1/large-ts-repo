import type {
  DrillExecutionProfile,
  DrillStatus,
  DrillTemplate,
  DrillRunContext,
  RecoveryDrillRunId,
  RecoveryDrillTemplateId,
  RecoveryDrillTenantId,
} from '@domain/recovery-drill/src';

export interface DrillTemplateRecord {
  tenantId: RecoveryDrillTenantId;
  templateId: RecoveryDrillTemplateId;
  template: DrillTemplate;
  archived: boolean;
  createdAt: string;
}

export interface DrillRunRecord {
  id: RecoveryDrillRunId;
  templateId: RecoveryDrillTemplateId;
  status: DrillStatus;
  mode: DrillTemplate['mode'];
  profile: DrillExecutionProfile;
  checkpoints: readonly string[];
  startedAt?: string;
  endedAt?: string;
  plan?: string;
  context?: DrillRunContext;
}

export interface DrillStoreQuery {
  tenant?: RecoveryDrillTenantId;
  templateIds?: readonly RecoveryDrillTemplateId[];
  status?: readonly DrillStatus[];
  from?: string;
  to?: string;
}

export interface DrillListResult {
  items: readonly DrillRunRecord[];
  total: number;
  nextCursor?: string;
}

export interface StoreMutationReport {
  writtenTemplates: number;
  updatedRuns: number;
  checkpointWrites: number;
  errors: readonly string[];
}

export interface StoreSnapshot {
  createdTemplates: number;
  activeRuns: number;
  archivedTemplates: number;
}
