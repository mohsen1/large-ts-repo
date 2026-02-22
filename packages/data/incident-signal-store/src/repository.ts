import type {
  SignalEnvelope,
  SignalId,
  SignalQueryFilter,
  SignalVector,
  SignalWindow,
  SignalRiskProfile,
  SignalPlanCandidate,
  SignalWindowInput,
  TenantId,
  SignalPlanId,
} from '@domain/incident-signal-intelligence';
import type { Query } from '@data/repositories';
import { InMemoryRepository, VersionedRepository } from '@data/repositories';
import { normalizeLimit } from '@shared/core';

export interface SignalStoreEvent {
  readonly id: string;
  readonly signalId: SignalId;
  readonly type: 'ingest' | 'ack' | 'resolve';
  readonly occurredAt: string;
}

export interface SignalStoreQuery extends Query<SignalEnvelope, SignalQueryFilter> {}

export interface SignalRepository {
  findById(id: SignalId): Promise<SignalEnvelope | null>;
  save(signal: SignalEnvelope): Promise<void>;
  deleteById(id: SignalId): Promise<void>;
  all(): Promise<SignalEnvelope[]>;
  query(filter: SignalStoreQuery): Promise<readonly SignalEnvelope[]>;
  appendPlan(plan: SignalPlanCandidate): Promise<void>;
  readPlans(signalId: SignalId): Promise<readonly SignalPlanCandidate[]>;
  readWindows(input: SignalWindowInput): Promise<readonly SignalWindow[]>;
  summarizeSignals(signalIds: readonly SignalId[]): Promise<readonly SignalRiskProfile[]>;
  events(): Promise<readonly SignalStoreEvent[]>;
}

interface SignalState {
  readonly signals: readonly SignalEnvelope[];
  readonly plans: readonly SignalPlanCandidate[];
  readonly windows: readonly SignalWindow[];
}

export class InMemorySignalRepository implements SignalRepository {
  private readonly signalsRepo: InMemoryRepository<SignalId, SignalEnvelope>;
  private readonly plansRepo: VersionedRepository<SignalPlanId, SignalPlanCandidate>;
  private readonly windowsRepo: InMemoryRepository<string, SignalWindow>;
  private readonly eventLog: SignalStoreEvent[] = [];

  constructor() {
    this.signalsRepo = new InMemoryRepository((entry) => entry.id as SignalId);
    this.plansRepo = new VersionedRepository((entry) => entry.id);
    this.windowsRepo = new InMemoryRepository((entry) => `${entry.from}-${entry.to}`);
  }

  async findById(id: SignalId): Promise<SignalEnvelope | null> {
    return this.signalsRepo.findById(id);
  }

  async save(signal: SignalEnvelope): Promise<void> {
    await this.signalsRepo.save(signal);
    this.eventLog.push({
      id: `${signal.id}:ingest`,
      signalId: signal.id,
      type: 'ingest',
      occurredAt: new Date().toISOString(),
    });
  }

  async deleteById(id: SignalId): Promise<void> {
    await this.signalsRepo.deleteById(id);
    this.eventLog.push({
      id: `${id}:resolve`,
      signalId: id,
      type: 'resolve',
      occurredAt: new Date().toISOString(),
    });
  }

  async all(): Promise<SignalEnvelope[]> {
    return this.signalsRepo.all();
  }

  async query(filter: SignalStoreQuery): Promise<readonly SignalEnvelope[]> {
    const items = await this.signalsRepo.all();
    const limit = normalizeLimit(filter.limit);
    const next = items.filter((item): item is SignalEnvelope => {
      const query = filter.filter as unknown as SignalQueryFilter | undefined;
      if (!query) {
        return true;
      }
      if (query.tenantId && item.tenantId !== query.tenantId) {
        return false;
      }
      if (query.kinds?.length && !query.kinds.includes(item.kind)) {
        return false;
      }
      if (query.states?.length && !query.states.includes(item.state)) {
        return false;
      }
      if (query.riskBands?.length && !query.riskBands.includes(item.risk)) {
        return false;
      }
      if (query.from && item.recordedAt < query.from) {
        return false;
      }
      if (query.to && item.recordedAt > query.to) {
        return false;
      }
      return true;
    });

    return next.slice(0, limit);
  }

  async appendPlan(plan: SignalPlanCandidate): Promise<void> {
    await this.plansRepo.save(plan);
  }

  async readPlans(signalId: SignalId): Promise<readonly SignalPlanCandidate[]> {
    const allPlans = await this.plansRepo.all();
    return allPlans.filter((entry) => entry.signalId === signalId);
  }

  async readWindows(input: SignalWindowInput): Promise<readonly SignalWindow[]> {
    const all = await this.windowsRepo.all();
    return all
      .filter((window) => window.samples.length > 0)
      .filter((window) => window.from >= input.from && window.to <= input.to)
      .filter((window) => input.tenantId ? window.samples.every((sample) => sample.magnitude >= 0) : true)
      .slice(0, normalizeLimit(input.limit));
  }

  async summarizeSignals(signalIds: readonly SignalId[]): Promise<readonly SignalRiskProfile[]> {
    const byId = new Set(signalIds);
    const matches = (await this.all()).filter((item) => byId.has(item.id));
    return matches.map((signal, index) => ({
      signalId: signal.id,
      riskBand: signal.risk,
      confidence: Math.min(1, 0.45 + index * 0.05),
      impactScore: Number(signal.vector.magnitude.toFixed(4)),
      mitigationLeadMinutes: Math.max(5, Math.floor((1 - signal.vector.entropy) * 90)),
    }));
  }

  async events(): Promise<readonly SignalStoreEvent[]> {
    return [...this.eventLog];
  }
}

export interface SignalWindowBuilder {
  buildWindow(signal: SignalEnvelope, lookbackMinutes: number): SignalWindow;
}

export class VectorWindowBuilder implements SignalWindowBuilder {
  buildWindow(signal: SignalEnvelope, lookbackMinutes: number): SignalWindow {
    const now = Date.now();
    const windowStart = new Date(now - lookbackMinutes * 60_000).toISOString();
    const windowEnd = new Date(now).toISOString();
    const vector: SignalVector = signal.vector;
    return {
      from: windowStart,
      to: windowEnd,
      samples: [vector],
    };
  }
}
