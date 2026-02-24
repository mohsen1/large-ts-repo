import type { IncidentLabScenario, IncidentLabRun } from '@domain/recovery-incident-lab-core';

interface CacheBucket<T> {
  readonly value: T;
  readonly at: number;
}

export interface LabCacheConfig {
  readonly ttlMs: number;
  readonly maxItems: number;
}

export class TypedTtlCache<T extends { id?: string; runId?: string }> {
  private values = new Map<string, CacheBucket<T>>();

  constructor(private readonly config: LabCacheConfig) {}

  set(item: T): void {
    const key = ('id' in item && item.id) ? item.id : ('runId' in item ? String(item.runId) : JSON.stringify(item));
    this.values.set(key, { value: item, at: Date.now() });
    if (this.values.size > this.config.maxItems) {
      const first = this.values.keys().next();
      if (first.value !== undefined) {
        this.values.delete(first.value);
      }
    }
  }

  get(id: string): T | undefined {
    const bucket = this.values.get(id);
    if (!bucket) {
      return undefined;
    }
    if (Date.now() - bucket.at > this.config.ttlMs) {
      this.values.delete(id);
      return undefined;
    }
    return bucket.value;
  }

  toList(): readonly T[] {
    return [...this.values.values()].map((entry) => entry.value);
  }
}

export class ScenarioCache extends TypedTtlCache<IncidentLabScenario> {
  constructor() {
    super({ ttlMs: 120000, maxItems: 200 });
  }
}

export class RunCache extends TypedTtlCache<IncidentLabRun> {
  constructor() {
    super({ ttlMs: 120000, maxItems: 300 });
  }
}
