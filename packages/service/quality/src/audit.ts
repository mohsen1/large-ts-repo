export interface AuditRecord {
  target: string;
  message: string;
  at: string;
}

export const log = (records: AuditRecord[], record: Omit<AuditRecord, 'at'>): AuditRecord[] => {
  return [...records, { ...record, at: new Date().toISOString() }];
};

export const search = (records: readonly AuditRecord[], keyword: string): AuditRecord[] => {
  return records.filter((record) => record.message.includes(keyword));
};

export const byTarget = (records: readonly AuditRecord[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const record of records) out[record.target] = (out[record.target] ?? 0) + 1;
  return out;
};
