import type { ReadThroughput, IncidentFusionStore, QueryFilter } from './types';
import type { RecoveryScenario, RecoverySignal, RecoveryAction, FusionSimulation, FusionPlan, SignalEnvelope } from '@domain/incident-fusion-models';

interface CacheEntry<T> {
  readonly value: T;
  readonly at: number;
  readonly ttlMs: number;
}

export class InMemoryFusionCache {
  private readonly signals = new Map<string, CacheEntry<RecoverySignal>>();
  private readonly scenarios = new Map<string, CacheEntry<RecoveryScenario>>();
  private readonly actions = new Map<string, CacheEntry<RecoveryAction>>();
  private readonly simulations = new Map<string, CacheEntry<FusionSimulation>>();
  private readonly plans = new Map<string, CacheEntry<FusionPlan>>();

  setSignal(signal: RecoverySignal, ttlMs = 60_000): void {
    this.signals.set(signal.id, { value: signal, at: Date.now(), ttlMs });
  }

  setScenario(scenario: RecoveryScenario, ttlMs = 60_000): void {
    this.scenarios.set(scenario.id, { value: scenario, at: Date.now(), ttlMs });
  }

  setAction(action: RecoveryAction, ttlMs = 60_000): void {
    this.actions.set(action.id, { value: action, at: Date.now(), ttlMs });
  }

  setSimulation(simulation: FusionSimulation, ttlMs = 60_000): void {
    this.simulations.set(simulation.runId, { value: simulation, at: Date.now(), ttlMs });
  }

  setPlan(plan: FusionPlan, ttlMs = 60_000): void {
    this.plans.set(plan.planId, { value: plan, at: Date.now(), ttlMs });
  }

  signalById(signalId: string): RecoverySignal | undefined {
    return this.pick(this.signals, signalId)?.value;
  }

  scenarioById(scenarioId: string): RecoveryScenario | undefined {
    return this.pick(this.scenarios, scenarioId)?.value;
  }

  actionById(actionId: string): RecoveryAction | undefined {
    return this.pick(this.actions, actionId)?.value;
  }

  snapshotSignals(): readonly SignalEnvelope<RecoverySignal>[] {
    return this.toArray(this.signals).map((entry) => ({
      tenant: entry.value.tenant,
      data: entry.value,
      recordedAt: new Date(entry.at).toISOString(),
    }));
  }

  querySignals(filter: QueryFilter): readonly RecoverySignal[] {
    return this.toArray(this.signals).map((entry) => entry.value).filter((signal) => this.matches(filter, signal.tenant, signal.id, signal.id));
  }

  queryScenarios(filter: QueryFilter): readonly RecoveryScenario[] {
    return this.toArray(this.scenarios).map((entry) => entry.value).filter((scenario) => this.matches(filter, scenario.tenant, scenario.id, undefined));
  }

  queryActions(filter: QueryFilter): readonly RecoveryAction[] {
    return this.toArray(this.actions).map((entry) => entry.value).filter((action) => this.matches(filter, action.tenant, action.id, action.scenarioId));
  }

  querySimulations(filter: QueryFilter): readonly FusionSimulation[] {
    return this.toArray(this.simulations).map((entry) => entry.value).filter((simulation) => {
      if (filter.tenant && simulation.tenant !== filter.tenant) return false;
      if (filter.scenarioId && simulation.scenarioId !== filter.scenarioId) return false;
      return true;
    });
  }

  queryPlans(filter: QueryFilter): readonly FusionPlan[] {
    return this.toArray(this.plans).map((entry) => entry.value).filter((plan) => {
      if (filter.tenant && plan.tenant !== filter.tenant) return false;
      if (filter.scenarioId && plan.scenarioId !== filter.scenarioId) return false;
      return true;
    });
  }

  private toArray<T>(map: Map<string, CacheEntry<T>>): CacheEntry<T>[] {
    return [...map.values()].filter((entry) => !this.isExpired(entry));
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.at > entry.ttlMs;
  }

  private pick<T>(map: Map<string, CacheEntry<T>>, id: string): CacheEntry<T> | undefined {
    const entry = map.get(id);
    if (!entry || this.isExpired(entry)) return undefined;
    return entry;
  }

  private matches(
    filter: QueryFilter,
    tenant: string,
    scenarioId: string,
    scenarioOrActionId?: string,
  ): boolean {
    if (filter.tenant && filter.tenant !== tenant) return false;
    if (filter.scenarioId && filter.scenarioId !== scenarioId) return false;
    if (filter.signalId && filter.signalId !== scenarioOrActionId) return false;
    if (filter.actionId && filter.actionId !== scenarioOrActionId) return false;
    return true;
  }
}

export class InMemoryFusionStore implements IncidentFusionStore {
  private readonly cache = new InMemoryFusionCache();
  private readonly throughput = new Map<string, number[]>();

  async saveSignal(tenant: string, signal: RecoverySignal): Promise<void> {
    this.cache.setSignal(signal);
    this.touch(tenant, signal.id);
  }

  async saveScenario(tenant: string, scenario: RecoveryScenario): Promise<void> {
    this.cache.setScenario(scenario);
    this.touch(tenant, scenario.id);
  }

  async saveAction(tenant: string, action: RecoveryAction): Promise<void> {
    this.cache.setAction(action);
    this.touch(tenant, action.id);
  }

  async saveSimulation(tenant: string, simulation: FusionSimulation): Promise<void> {
    this.cache.setSimulation(simulation);
    this.touch(tenant, simulation.runId);
  }

  async savePlan(tenant: string, plan: FusionPlan): Promise<void> {
    this.cache.setPlan(plan);
    this.touch(tenant, plan.planId);
  }

  async listSignals(filter: QueryFilter): Promise<readonly RecoverySignal[]> {
    return this.cache.querySignals(filter);
  }

  async listScenarios(filter: QueryFilter): Promise<readonly RecoveryScenario[]> {
    return this.cache.queryScenarios(filter);
  }

  async listActions(filter: QueryFilter): Promise<readonly RecoveryAction[]> {
    return this.cache.queryActions(filter);
  }

  async listSimulations(filter: QueryFilter): Promise<readonly FusionSimulation[]> {
    return this.cache.querySimulations(filter);
  }

  async listPlans(filter: QueryFilter): Promise<readonly FusionPlan[]> {
    return this.cache.queryPlans(filter);
  }

  async getThroughput(tenant: string, scenarioId: RecoveryScenario['id']): Promise<ReadThroughput> {
    const bucket = this.throughput.get(`${tenant}:${scenarioId}`) ?? [];
    const sorted = [...bucket].sort((a, b) => a - b);
    const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)] ?? 0;
    const failures = bucket.filter((value) => value < 0).length;
    return {
      scenarioId,
      tenant,
      totalRuns: sorted.length,
      medianMinutes: median,
      failureRate: sorted.length === 0 ? 0 : failures / sorted.length,
      lastRunAt: sorted.length > 0 ? new Date().toISOString() : undefined,
    };
  }

  async snapshot(tenant: string): Promise<readonly SignalEnvelope<RecoverySignal>[] | null> {
    return this.cache.snapshotSignals().filter((signal) => signal.tenant === tenant);
  }

  touch(tenant: string, key: string): void {
    const bucket = `${tenant}:${key}`;
    const current = this.throughput.get(bucket) ?? [];
    const next = [...current, Math.abs(key.length) / 2].slice(-20);
    this.throughput.set(bucket, next);
  }
}
