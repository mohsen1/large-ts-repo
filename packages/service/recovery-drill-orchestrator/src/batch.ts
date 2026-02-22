import { RecoveryDrillOrchestrator } from './orchestrator';
import type { DrillDependencies } from './types';
import type { DrillTemplateRecord } from '@data/recovery-drill-store/src';
import { withBrand } from '@shared/core';
import type { RecoveryDrillTenantId } from '@domain/recovery-drill/src';
import { buildServiceOverview } from './metrics';
import { fail, ok, type Result } from '@shared/result';

export interface BatchStartInput {
  readonly tenant: RecoveryDrillTenantId;
  readonly initiatedBy: string;
  readonly mode?: 'tabletop' | 'game-day' | 'automated-chaos' | 'customer-sim';
  readonly limit?: number;
}

export interface BatchOperationReport {
  readonly tenant: RecoveryDrillTenantId;
  readonly requested: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly runIds: readonly string[];
  readonly activeAfter: number;
}

export interface BatchOrchestrator {
  runBatch(input: BatchStartInput): Promise<Result<BatchOperationReport, Error>>;
}

const dedupeTemplateIds = (ids: readonly string[]): readonly string[] => Array.from(new Set(ids));

const sortTemplates = (templates: readonly DrillTemplateRecord[]): DrillTemplateRecord[] =>
  [...templates].sort((left, right) => right.template.priority.localeCompare(left.template.priority));

export class RecoveryDrillBatchOrchestrator implements BatchOrchestrator {
  constructor(private readonly dependencies: DrillDependencies) {}

  async runBatch(input: BatchStartInput): Promise<Result<BatchOperationReport, Error>> {
    const templates = await this.dependencies.templates.listTemplates(input.tenant);
    const sorted = sortTemplates(templates);
    const candidates = dedupeTemplateIds(sorted.slice(0, input.limit ?? 3).map((template) => template.templateId));
    const orchestrator = new RecoveryDrillOrchestrator(this.dependencies);
    let accepted = 0;
    let rejected = 0;
    const runIds: string[] = [];
    const startErrors: string[] = [];
    for (const templateId of candidates) {
      const created = {
        templateId: templateId as never,
        initiatedBy: input.initiatedBy,
        mode: input.mode,
        runAt: new Date().toISOString(),
        approvals: undefined,
      };
      const result = await orchestrator.start(created);
      if (result.ok) {
        accepted += 1;
        runIds.push(withBrand(`${templateId}-${accepted}`, 'RecoveryDrillRunId') as string);
      } else {
        rejected += 1;
        startErrors.push(result.error.message);
      }
    }
    const overview = await this.overview(input.tenant);
    if (startErrors.length > 0) {
      return fail(new Error(`partial-failure:${startErrors.join(',')}`));
    }
    return ok({
      tenant: input.tenant,
      requested: candidates.length,
      accepted,
      rejected,
      runIds,
      activeAfter: overview.activeRuns,
    });
  }

  private async overview(tenant: RecoveryDrillTenantId): Promise<{
    activeRuns: number;
  }> {
    const templates = await this.dependencies.templates.listTemplates(tenant);
    const runsResult = await this.dependencies.runs.listRuns({ tenant, status: ['running', 'queued'] });
    const overview = buildServiceOverview(templates, runsResult.items);
    const perTenant = overview.byTenant.get(tenant);
    return { activeRuns: perTenant?.activeRuns ?? 0 };
  }
}

export const createBatchOrchestrator = (dependencies: DrillDependencies): RecoveryDrillBatchOrchestrator =>
  new RecoveryDrillBatchOrchestrator(dependencies);
