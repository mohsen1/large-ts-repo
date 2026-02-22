import { LedgerEntry, LedgerEntryKind, sumAmount } from './ledger';

export interface ValidationIssue {
  path: readonly string[];
  message: string;
  code: string;
}

export function hasBalancedCurrency(entries: readonly LedgerEntry[]): boolean {
  const set = new Set(entries.map((entry) => entry.amount.currency));
  return set.size <= 1;
}

export function validateEntry(entry: LedgerEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (entry.amount.amount === 0) {
    issues.push({ path: ['amount'], message: 'Zero value', code: 'E_ZERO' });
  }
  if (!entry.id || entry.id.length === 0) {
    issues.push({ path: ['id'], message: 'Missing id', code: 'E_NO_ID' });
  }
  return issues;
}

export function validatePage(entries: readonly LedgerEntry[], knownKinds?: readonly LedgerEntryKind[]): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!hasBalancedCurrency(entries)) {
    issues.push({ path: ['entries'], message: 'mixed currency', code: 'E_CURRENCY' });
  }
  const kinds = new Set(knownKinds ?? []);
  if (knownKinds?.length) {
    for (const entry of entries) {
      if (!kinds.has(entry.kind)) {
        issues.push({ path: ['entries', entry.id], message: `invalid kind ${entry.kind}`, code: 'E_KIND' });
      }
    }
  }
  for (const entry of entries) {
    issues.push(...validateEntry(entry));
  }

  return { ok: issues.length === 0, issues };
}

export function totalIsSafe(entries: readonly LedgerEntry[]): boolean {
  const total = sumAmount(entries);
  return Number.isFinite(total.amount) && Math.abs(total.amount) < 1e18;
}
