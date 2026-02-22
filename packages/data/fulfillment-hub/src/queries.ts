import { FulfillmentExecution, FulfillmentPlan } from '@domain/fulfillment-orchestration';
import { Result, ok } from '@shared/result';

export interface SLARecord {
  tenantId: string;
  runCount: number;
  deliveredRunCount: number;
  failedRunCount: number;
  averageLeadMinutes: number;
}

export const summarizeRuns = (plans: readonly FulfillmentPlan[], runs: readonly FulfillmentExecution[]): SLARecord[] => {
  const index = new Map<string, { delivered: number; failed: number; runMinutes: number[] }>();

  for (const run of runs) {
    const tenant = run.planId.split('-')[0] ?? 'unknown';
    const bucket = index.get(tenant) ?? { delivered: 0, failed: 0, runMinutes: [] };
    if (run.status === 'done') bucket.delivered += 1;
    if (run.status === 'errored') bucket.failed += 1;
    if (run.finishedAt && run.startedAt) {
      const diff = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
      bucket.runMinutes.push(diff / 60000);
    }
    index.set(tenant, bucket);
  }

  const records: SLARecord[] = [];
  for (const [tenantId, value] of index.entries()) {
    const avg = value.runMinutes.reduce((sum, value) => sum + value, 0) / Math.max(1, value.runMinutes.length);
    records.push({
      tenantId,
      runCount: value.delivered + value.failed,
      deliveredRunCount: value.delivered,
      failedRunCount: value.failed,
      averageLeadMinutes: Number.isFinite(avg) ? avg : 0,
    });
  }

  return records.concat([
    {
      tenantId: 'global',
      runCount: runs.length,
      deliveredRunCount: runs.filter((run) => run.status === 'done').length,
      failedRunCount: runs.filter((run) => run.status === 'errored').length,
      averageLeadMinutes: plans.length > 0 ? Number((0).toFixed(2)) : 0,
    },
  ]);
};

export interface QueryResult {
  plans: FulfillmentPlan[];
  runs: FulfillmentExecution[];
  records: SLARecord[];
}

export const buildDashboard = async (
  plans: readonly FulfillmentPlan[],
  runs: readonly FulfillmentExecution[],
): Promise<Result<QueryResult>> => {
  return ok({
    plans: [...plans],
    runs: [...runs],
    records: summarizeRuns(plans, runs),
  });
};
