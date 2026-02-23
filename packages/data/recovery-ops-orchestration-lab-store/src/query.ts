import type { OrchestrationLab, OrchestrationLabEnvelope, LabQueryFilter, LabRunRecord, PagedResult, OrchestrationLabRecord } from './model';

const safePageSize = (value?: number): number => {
  if (!value || value <= 0 || !Number.isFinite(value)) {
    return 25;
  }
  return Math.min(200, Math.floor(value));
};

const safePage = (value?: number): number => {
  if (!value || value <= 0 || !Number.isFinite(value)) {
    return 1;
  }
  return Math.floor(value);
};

export const paginate = <T>(items: readonly T[], filter: LabQueryFilter): PagedResult<T> => {
  const page = safePage(filter.page);
  const pageSize = safePageSize(filter.pageSize);
  const offset = (page - 1) * pageSize;
  return {
    data: items.slice(offset, offset + pageSize),
    total: items.length,
    page,
    pageSize,
  };
};

const matchFilter = (entry: OrchestrationLabEnvelope, filter: LabQueryFilter): boolean => {
  if (!filter.tenantId) {
    return true;
  }
  if (entry.lab.tenantId !== filter.tenantId) {
    return false;
  }
  return !filter.scenarioId || entry.lab.scenarioId === filter.scenarioId;
};

export const queryLabs = (items: readonly OrchestrationLabEnvelope[], filter: LabQueryFilter): PagedResult<OrchestrationLabEnvelope> => {
  const filtered = items.filter((entry) => {
    if (!matchFilter(entry, filter)) {
      return false;
    }
    if (!filter.signalTier) {
      return true;
    }
    return entry.lab.signals.some(
      (signal: OrchestrationLabEnvelope['lab']['signals'][number]) =>
        signal.tier === filter.signalTier,
    );
  });
  const ordered = [...filtered].sort((left, right) => right.lab.updatedAt.localeCompare(left.lab.updatedAt));
  return paginate(ordered, filter);
};

export const queryRuns = (runs: readonly LabRunRecord[], filter: LabQueryFilter): PagedResult<LabRunRecord> => {
  const ordered = [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return paginate(ordered, filter);
};

export const collectLabs = (envelopes: readonly OrchestrationLabRecord[]): OrchestrationLab[] =>
  envelopes.map((entry) => entry.envelope.lab);
