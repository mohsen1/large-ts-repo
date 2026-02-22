import { ReportPayload, Cell } from './definitions';

export type Rendered = {
  header: string;
  body: string;
};

export const toCsv = (payload: ReportPayload): string => {
  const lines = ['key,value', ...payload.rows.map((row) => `${row.key},${row.value}`)];
  return lines.join('\n');
};

export const toMarkdown = (payload: ReportPayload): string => {
  const header = `# Report ${payload.spec.id}`;
  const rows = payload.rows.map((row) => `- ${row.key}: ${row.value}`);
  return [header, ...rows].join('\n');
};

export const serialize = (payload: ReportPayload): Rendered[] => [
  { header: 'csv', body: toCsv(payload) },
  { header: 'md', body: toMarkdown(payload) },
];

export const sum = (rows: readonly Cell[]): number => rows.reduce((acc, row) => acc + row.value, 0);

export const sortRows = (rows: readonly Cell[]): Cell[] => {
  return [...rows].sort((a, b) => b.value - a.value);
};
