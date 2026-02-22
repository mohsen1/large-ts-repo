export interface ReportFilter {
  tenantId: string;
  from: string;
  to: string;
  dimensions: string[];
}

export type ReportType = 'sales' | 'growth' | 'cohort' | 'risk';

export interface ReportSpec {
  id: string;
  type: ReportType;
  filter: ReportFilter;
  generatedAt: string;
}

export interface Cell {
  key: string;
  value: number;
  meta?: Record<string, unknown>;
}

export interface ReportPayload {
  spec: ReportSpec;
  rows: readonly Cell[];
}

export const asType = (value: string): ReportType => {
  if (value === 'sales' || value === 'growth' || value === 'cohort' || value === 'risk') return value;
  return 'sales';
};

export const isEmpty = (payload: ReportPayload): boolean => payload.rows.length === 0;

export const groupBy = (payload: ReportPayload): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const cell of payload.rows) {
    out[cell.key] = (out[cell.key] ?? 0) + cell.value;
  }
  return out;
};
