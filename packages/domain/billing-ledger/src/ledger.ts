import { Brand, UnionToIntersection } from '@shared/type-level';

export type AccountId = Brand<string, 'account-id'>;
export type InvoiceId = Brand<string, 'invoice-id'>;
export type TxnId = Brand<string, 'txn-id'>;

export interface Money {
  currency: 'USD' | 'EUR' | 'JPY';
  amount: number;
}

export type LedgerEntryKind =
  | 'charge'
  | 'refund'
  | 'credit'
  | 'debit'
  | 'adjustment'
  | 'writeoff';

export interface LedgerEntryBase {
  id: TxnId;
  accountId: AccountId;
  invoiceId: InvoiceId;
  kind: LedgerEntryKind;
  createdAt: Date;
  postedAt?: Date;
  amount: Money;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface ChargeEntry extends LedgerEntryBase { kind: 'charge'; invoiceId: InvoiceId; }
export interface RefundEntry extends LedgerEntryBase { kind: 'refund'; reason: string; }
export interface CreditEntry extends LedgerEntryBase { kind: 'credit'; source: Brand<string, 'source-id'>; }
export interface DebitEntry extends LedgerEntryBase { kind: 'debit'; budgetLine: Brand<string, 'budget-id'>; }
export interface AdjustmentEntry extends LedgerEntryBase { kind: 'adjustment'; adjuster: Brand<string, 'actor-id'>; }
export interface WriteoffEntry extends LedgerEntryBase { kind: 'writeoff'; policy: string; }

export type LedgerEntry = ChargeEntry | RefundEntry | CreditEntry | DebitEntry | AdjustmentEntry | WriteoffEntry;

export interface LedgerPage {
  accountId: AccountId;
  entries: readonly LedgerEntry[];
  cursor?: string;
}

export interface LedgerSnapshot {
  accountId: AccountId;
  snapshotAt: Date;
  balance: Money;
  version: number;
}

export interface Ledger {
  startDate: Date;
  currency: 'USD' | 'EUR' | 'JPY';
  entries: readonly LedgerEntry[];
}

export function sumAmount(entries: readonly LedgerEntry[]): Money {
  return entries.reduce(
    (acc, entry) => ({
      currency: acc.currency,
      amount: acc.amount + (entry.kind === 'refund' || entry.kind === 'credit' ? -entry.amount.amount : entry.amount.amount),
    }),
    { currency: entries[0]?.amount.currency ?? 'USD', amount: 0 },
  );
}

export function applyEntry(ledger: Ledger, entry: LedgerEntry): Ledger {
  return {
    ...ledger,
    entries: [...ledger.entries, entry],
  };
}

export function reverse(entry: LedgerEntry): LedgerEntry {
  const reversedKind = entry.kind === 'charge' ? 'refund' : entry.kind === 'debit' ? 'credit' : 'adjustment';
  return {
    ...entry,
    id: `${entry.id}-rev` as TxnId,
    kind: reversedKind as LedgerEntry['kind'],
    amount: { ...entry.amount, amount: -entry.amount.amount },
    createdAt: new Date(),
    postedAt: new Date(),
  } as LedgerEntry;
}

export function mergeSnapshots(a: LedgerSnapshot, b: LedgerSnapshot): LedgerSnapshot {
  const amount = a.balance.currency === b.balance.currency ? a.balance.amount + b.balance.amount : a.balance.amount;
  return {
    accountId: a.accountId,
    snapshotAt: a.snapshotAt > b.snapshotAt ? a.snapshotAt : b.snapshotAt,
    balance: { currency: a.balance.currency, amount },
    version: Math.max(a.version, b.version) + 1,
  };
}

export function buildProjection(entries: readonly LedgerEntry[]): { byKind: Record<LedgerEntryKind, number>; total: number } {
  const byKind = entries.reduce(
    (acc, entry) => {
      acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<LedgerEntryKind, number>,
  );

  return {
    byKind: { charge: 0, refund: 0, credit: 0, debit: 0, adjustment: 0, writeoff: 0, ...byKind },
    total: sumAmount(entries).amount,
  };
}

export function mergeIntersections<A, B>(a: A, b: B): UnionToIntersection<{ [K in keyof A & keyof B]: A[K] & B[K] }[keyof A & keyof B]> {
  const keys = [...new Set([...Object.keys(a as any), ...Object.keys(b as any])];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = Object.assign({}, (a as any)[key], (b as any)[key]);
  }
  return out as any;
}
