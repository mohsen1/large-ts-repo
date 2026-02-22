import { Fact, FactRepository, FactSet } from './schema';

export interface Snapshot {
  id: string;
  tenantId: string;
  count: number;
  checksum: string;
  createdAt: Date;
  facts: Fact[];
}

export class InMemoryFactRepo implements FactRepository {
  private readonly store = new Map<string, Fact>();
  private readonly byTenant = new Map<string, Set<string>>();

  async put(fact: Fact): Promise<void> {
    this.store.set(fact.id, fact);
    const bucket = this.byTenant.get(fact.tenantId) ?? new Set<string>();
    bucket.add(fact.id);
    this.byTenant.set(fact.tenantId, bucket);
  }

  async get(id: string): Promise<Fact | undefined> {
    return this.store.get(id);
  }

  async list(tenant: string): Promise<Fact[]> {
    const ids = this.byTenant.get(tenant) ?? new Set();
    const out: Fact[] = [];
    for (const id of ids) {
      const fact = this.store.get(id);
      if (fact) out.push(fact);
    }
    return out;
  }

  async snapshot(tenant: string): Promise<Snapshot> {
    const facts = await this.list(tenant);
    return {
      id: `${tenant}:${Date.now()}`,
      tenantId: tenant,
      count: facts.length,
      checksum: String(facts.length),
      createdAt: new Date(),
      facts,
    };
  }
}

export function fromSet(set: FactSet): Fact[] {
  return set.facts;
}
