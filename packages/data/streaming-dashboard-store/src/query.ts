import { DashboardQueryFilter, DashboardQueryResult } from './models';
import { InMemoryStreamingDashboardRepository } from './repository';

export interface DashboardQueryOptions {
  tenant?: string;
  streamId?: string;
  from?: Date;
  to?: Date;
  criticalOnly?: boolean;
}

const toTimestamp = (value?: Date): number | undefined => value?.getTime();

const normalizeFilter = (options: DashboardQueryOptions): DashboardQueryFilter => ({
  tenant: options.tenant as DashboardQueryFilter['tenant'],
  streamId: options.streamId,
  fromMs: toTimestamp(options.from),
  toMs: toTimestamp(options.to),
  withCriticalSignalsOnly: options.criticalOnly,
});

export const queryDashboardSnapshots = async (
  repository: InMemoryStreamingDashboardRepository,
  options: DashboardQueryOptions,
): Promise<DashboardQueryResult> => repository.query(normalizeFilter(options));
