import { ReportSpec, ReportPayload, Cell } from '@domain/reporting/definitions';

export const buildRows = (spec: ReportSpec, seed: number): Cell[] => {
  return Array.from({ length: 20 }, (_, index) => ({
    key: `${spec.type}:${index}`,
    value: ((seed + index) * 7) % 100,
    meta: { tenantId: spec.filter.tenantId },
  }));
};

export const generate = (spec: ReportSpec): ReportPayload => ({
  spec,
  rows: buildRows(spec, spec.filter.dimensions.length),
});
