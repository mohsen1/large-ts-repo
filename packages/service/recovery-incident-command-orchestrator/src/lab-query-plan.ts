import { queryByStatus, queryByRiskBand, summarizeRecordStats } from '@data/incident-command-store/lab-queries';
import { parseLabRecords } from '@data/incident-command-store/lab-schemas';
import type { CommandLabRecord, CommandLabRecordStatus } from '@data/incident-command-store/lab-records';
import { InMemoryCommandLabRecordStore } from '@data/incident-command-store';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';

interface QueryCursor {
  readonly tenantId: string;
  readonly maxRisk?: number;
  readonly status?: CommandLabRecordStatus;
}

export interface LabRecordReport {
  readonly tenantId: string;
  readonly total: number;
  readonly totalExpectedRunMinutes: number;
  readonly maxRisk: number;
  readonly averageExpectedRunMinutes: number;
  readonly selected: readonly string[];
}

export class CommandLabPlanQuery {
  private readonly store = new InMemoryCommandLabRecordStore();

  async importRecords(payload: string): Promise<Result<readonly CommandLabRecord[], Error>> {
    try {
      const parsed = parseLabRecords(JSON.parse(payload));
      for (const record of parsed) {
        await this.store.upsertRecord(record.tenantId, record.command);
      }
      return ok(parsed);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to import records'));
    }
  }

  async run(cursor: QueryCursor): Promise<Result<LabRecordReport, Error>> {
    const query = await this.store.listByTenant(cursor.tenantId);
    if (!query.ok) {
      return fail(query.error);
    }
    const records = [...query.value];

    const riskFiltered = queryByRiskBand(records, cursor.maxRisk ?? 0.4);
    const statusFiltered = cursor.status ? queryByStatus(riskFiltered, cursor.status) : riskFiltered;

    const summary = summarizeRecordStats(statusFiltered);
    return ok({
      tenantId: cursor.tenantId,
      total: summary.total,
      totalExpectedRunMinutes: summary.totalExpectedRunMinutes,
      maxRisk: summary.maxRisk,
      averageExpectedRunMinutes: summary.averageExpectedRunMinutes,
      selected: statusFiltered.map((record) => record.id),
    });
  }

  async byPlan(planId: string, tenantId: string): Promise<Result<readonly CommandLabRecord[], Error>> {
    const list = await this.store.listByTenant(tenantId);
    if (!list.ok) {
      return fail(list.error);
    }
    const planRecords = list.value.filter((record) => record.planId === planId);
    return ok(planRecords);
  }
}
