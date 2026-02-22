import { ContinuityRunRow } from './models';

export interface ContinuityJournalAdapter {
  hydrate(raw: unknown): ContinuityRunRow | null;
  serialize(row: ContinuityRunRow): string;
}

export const jsonAdapter: ContinuityJournalAdapter = {
  hydrate(raw: unknown): ContinuityRunRow | null {
    if (typeof raw !== 'string') return null;
    try {
      const parsed = JSON.parse(raw) as ContinuityRunRow;
      if (!parsed?.id || !parsed.payload) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  serialize(row: ContinuityRunRow): string {
    return JSON.stringify(row);
  },
};
