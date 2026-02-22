import { generate } from '@service/reporting/generator';
import { toMarkdown, toCsv } from '@domain/reporting/render';
import { ReportType } from '@domain/reporting/definitions';

export interface ReportRequest {
  tenantId: string;
  from: string;
  to: string;
  type: ReportType;
}

export const buildReport = async (request: ReportRequest): Promise<string> => {
  const spec = {
    id: `report-${request.tenantId}-${Date.now()}`,
    type: request.type,
    filter: { tenantId: request.tenantId, from: request.from, to: request.to, dimensions: ['tenant', 'date'] },
    generatedAt: new Date().toISOString(),
  };
  const payload = generate(spec as any);
  return JSON.stringify({ csv: toCsv(payload), md: toMarkdown(payload) });
};
