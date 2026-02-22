import { LedgerEntry, buildProjection, Ledger, LedgerSnapshot, sumAmount, LedgerEntryKind, LedgerPage, applyEntry } from './ledger';

export interface LedgerQuery {
  from?: Date;
  to?: Date;
  kinds?: readonly LedgerEntryKind[];
  includeMetadata: boolean;
}

export interface PagedInput {
  cursor?: string;
  limit: number;
}

export interface LedgerRepository {
  scan(page: PagedInput, query?: LedgerQuery): Promise<LedgerPage>;
  snapshot(accountId: string): Promise<LedgerSnapshot>;
}

export interface ProjectionEngine {
  materialize(ledger: Ledger): Promise<LedgerSnapshot>;
  reconcile(left: LedgerSnapshot, right: LedgerSnapshot): Promise<LedgerSnapshot>;
}

export class InMemoryProjection implements ProjectionEngine {
  private snapshots = new Map<string, LedgerSnapshot>();

  constructor(private readonly repo: LedgerRepository) {}

  async materialize(ledger: Ledger): Promise<LedgerSnapshot> {
    const cursor = `${ledger.accountId}:${ledger.startDate.toISOString()}`;
    const total = sumAmount(ledger.entries);
    const snapshot = {
      accountId: ledger.accountId,
      snapshotAt: new Date(),
      balance: total,
      version: 1,
    };
    this.snapshots.set(cursor, snapshot);
    return snapshot;
  }

  async reconcile(left: LedgerSnapshot, right: LedgerSnapshot): Promise<LedgerSnapshot> {
    return {
      accountId: left.accountId,
      snapshotAt: new Date(Math.max(left.snapshotAt.getTime(), right.snapshotAt.getTime())),
      balance: {
        currency: left.balance.currency,
        amount: left.balance.amount + right.balance.amount,
      },
      version: Math.max(left.version, right.version) + 1,
    };
  }

  async refresh(accountId: string): Promise<LedgerSnapshot | undefined> {
    let page = await this.repo.scan({}, { includeMetadata: false });
    let cursor = page.cursor;
    const snapshot = await this.repo.snapshot(accountId);
    if (!page.entries) {
      return snapshot;
    }
    return {
      ...snapshot,
      snapshotAt: new Date(),
      balance: page.entries.length
        ? sumAmount(page.entries)
        : snapshot.balance,
      version: snapshot.version + (page.entries?.length ?? 0),
    };
  }
}

export function projectPage(page: LedgerPage, query?: LedgerQuery): LedgerPage {
  const allowedKinds = new Set(query?.kinds ?? []);
  const filtered = query?.kinds
    ? page.entries.filter((entry) => allowedKinds.has(entry.kind))
    : page.entries;
  const sorted = [...filtered].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { ...page, entries: sorted };
}

export function appendEntries(base: Ledger, extra: readonly any[]): Ledger {
  const nextEntries = [...base.entries, ...extra.map((item) => item as LedgerEntry)];
  return { startDate: base.startDate, currency: base.currency, entries: nextEntries };
}
