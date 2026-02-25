import { InMemoryRepository } from '@data/repositories';
import { fail, ok, type Result } from '@shared/result';
import { createIteratorChain } from '@shared/fault-intel-runtime';
import type { IncidentSignal, TenantId, WorkspaceId } from '@domain/fault-intel-orchestration';
import type { CampaignRunTemplate, CampaignRunResult, CampaignId } from '@domain/fault-intel-orchestration';
import {
  campaignTemplateSchemaGuard,
  inferRunSummary,
  normalizeCampaignStoreInput,
  normalizeRunResult,
  type CampaignRunRecord,
  type CampaignTemplateRecord,
  scoreCampaignSignal,
  CampaignStoreRecord,
} from './schema';

interface CampaignRecordState {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly templates: Map<string, CampaignTemplateRecord>;
  readonly runs: Map<string, CampaignStoreRecord>;
}

export interface CampaignStoreQuery {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly campaignId?: CampaignId;
  readonly minRiskScore?: number;
}

export interface CampaignStoreSummary {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly templateCount: number;
  readonly runCount: number;
  readonly uniqueSignals: number;
  readonly riskAverage: number;
}

const stateByTenant = new Map<string, CampaignRecordState>();
const runTemplates = new InMemoryRepository<string, CampaignTemplateRecord>((record) => record.campaignId);
const runStore = new InMemoryRepository<string, CampaignStoreRecord>((record) => record.runId);

const getState = (tenantId: TenantId, workspaceId: WorkspaceId): CampaignRecordState => {
  const key = `${tenantId}::${workspaceId}`;
  const existing = stateByTenant.get(key);
  if (existing) {
    return existing;
  }
  const created: CampaignRecordState = {
    tenantId,
    workspaceId,
    templates: new Map(),
    runs: new Map(),
  };
  stateByTenant.set(key, created);
  return created;
};

export interface FaultIntelStore {
  upsertTemplate(tenantId: TenantId, workspaceId: WorkspaceId, template: CampaignRunTemplate): Promise<Result<CampaignTemplateRecord, Error>>;
  listTemplates(tenantId: TenantId, workspaceId: WorkspaceId): Promise<CampaignTemplateRecord[]>;
  deleteTemplate(tenantId: TenantId, workspaceId: WorkspaceId, campaignId: CampaignId): Promise<boolean>;
  recordRun(tenantId: TenantId, workspaceId: WorkspaceId, run: CampaignRunResult): Promise<Result<CampaignStoreRecord, Error>>;
  listRuns(tenantId: TenantId, workspaceId: WorkspaceId, query?: CampaignStoreQuery): Promise<CampaignStoreRecord[]>;
  querySignals(tenantId: TenantId, workspaceId: WorkspaceId, severity: IncidentSignal['severity']): Promise<IncidentSignal[]>;
  summarize(tenantId: TenantId, workspaceId: WorkspaceId): Promise<CampaignStoreSummary>;
}

class InMemoryCampaignStore {
  public async upsertTemplate(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    template: CampaignRunTemplate,
  ): Promise<Result<CampaignTemplateRecord, Error>> {
    const state = getState(tenantId, workspaceId);
    const parse = campaignTemplateSchemaGuard.safeParse(template as unknown);
    if (!parse.success) {
      return fail(new Error(`Invalid campaign template: ${parse.error.message}`));
    }
    const record = normalizeCampaignStoreInput(template);
    state.templates.set(record.campaignId, record);
    await runTemplates.save(record);
    return ok(record);
  }

  public async listTemplates(tenantId: TenantId, workspaceId: WorkspaceId): Promise<CampaignTemplateRecord[]> {
    const state = getState(tenantId, workspaceId);
    return [...state.templates.values()].sort((left, right) => left.campaignId.localeCompare(right.campaignId));
  }

  public async deleteTemplate(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    campaignId: CampaignId,
  ): Promise<boolean> {
    const state = getState(tenantId, workspaceId);
    return state.templates.delete(campaignId);
  }

  public async recordRun(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    run: CampaignRunResult,
  ): Promise<Result<CampaignStoreRecord, Error>> {
    const state = getState(tenantId, workspaceId);
    const existingTemplate = state.templates.get(run.campaign.campaignId);
    if (!existingTemplate) {
      return fail(new Error(`Campaign missing for run ${run.planId}`));
    }
    const template = existingTemplate;
    const normalizedPlan = normalizeRunResult(run);
    const record: CampaignStoreRecord = {
      runId: run.planId,
      tenantId,
      workspaceId,
      campaignId: run.campaign.campaignId,
      template,
      plan: normalizedPlan,
      rawSignals: [...run.signals],
      summary: inferRunSummary(normalizedPlan),
      status: 'finalized' as const,
    };
    state.runs.set(record.runId, record);
    await runStore.save(record);
    return ok(record);
  }

  public async listRuns(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    query: CampaignStoreQuery = {},
  ): Promise<CampaignStoreRecord[]> {
    const state = getState(tenantId, workspaceId);
    return createIteratorChain(state.runs.values())
      .filter((record) => {
        if (query.tenantId && record.tenantId !== query.tenantId) {
          return false;
        }
        if (query.workspaceId && record.workspaceId !== query.workspaceId) {
          return false;
        }
        if (query.campaignId && record.campaignId !== query.campaignId) {
          return false;
        }
        if (query.minRiskScore !== undefined && record.plan.riskScore < query.minRiskScore) {
          return false;
        }
        return true;
      })
      .toArray()
      .filter((record) => record.status === 'finalized');
  }

  public async querySignals(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    severity: IncidentSignal['severity'],
  ): Promise<IncidentSignal[]> {
    const runs = await this.listRuns(tenantId, workspaceId, {});
    const signals = runs.flatMap((record) => record.plan.signals);
    return signals.filter((signal) => signal.severity === severity);
  }

  public async summarize(tenantId: TenantId, workspaceId: WorkspaceId): Promise<CampaignStoreSummary> {
    const state = getState(tenantId, workspaceId);
    const runs = [...state.runs.values()];
    const risks = runs.map((run) => run.plan.riskScore);
    const totalRisk = risks.reduce((acc, value) => acc + value, 0);
    const signalCount = runs.flatMap((run) => run.plan.signals).length;
    const uniqueSignals = new Set(
      runs.flatMap((run) => run.plan.signals.map((signal: IncidentSignal) => signal.signalId)),
    ).size;
    return {
      tenantId,
      workspaceId,
      templateCount: state.templates.size,
      runCount: state.runs.size,
      uniqueSignals,
      riskAverage: runs.length === 0 ? 0 : totalRisk / runs.length,
    };
  }

  public scoreSignals(signals: readonly IncidentSignal[]): number[] {
    return signals.map(scoreCampaignSignal);
  }
}

export const createFaultIntelStore = (): FaultIntelStore => {
  const base = new InMemoryCampaignStore();

  return {
    upsertTemplate: base.upsertTemplate.bind(base),
    listTemplates: base.listTemplates.bind(base),
    deleteTemplate: base.deleteTemplate.bind(base),
    recordRun: base.recordRun.bind(base),
    listRuns: base.listRuns.bind(base),
    querySignals: base.querySignals.bind(base),
    summarize: base.summarize.bind(base),
  };
};
