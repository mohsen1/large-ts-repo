import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { buildSignalOrchestrator } from './signal-engine';
import type { SignalRepository } from '@data/incident-signal-store';
import type { SignalEnvelope, SignalRiskProfile, TenantId } from '@domain/incident-signal-intelligence';

export interface SignalDashboardView {
  readonly tenantId: TenantId;
  readonly totalSignals: number;
  readonly criticalSignals: number;
  readonly plansQueued: number;
  readonly riskSignals: readonly SignalRiskProfile[];
}

export interface SignalViewService {
  readonly load: (tenantId: TenantId) => Promise<SignalDashboardView>;
  readonly refresh: (tenantId: TenantId) => Promise<void>;
}

const normalizeViewState = (
  tenantId: TenantId,
  signals: readonly SignalEnvelope[],
  riskProfiles: readonly SignalRiskProfile[],
): SignalDashboardView => ({
  tenantId,
  totalSignals: signals.length,
  criticalSignals: signals.filter((signal) => signal.risk === 'critical').length,
  plansQueued: riskProfiles.length,
  riskSignals: riskProfiles,
});

export const createSignalDashboard = (signalStore: SignalRepository, repo: RecoveryIncidentRepository): SignalViewService => ({
  async load(tenantId: TenantId) {
    const engine = buildSignalOrchestrator(tenantId, signalStore, repo);
    const snapshot = await engine.execute({ tenantId });
    return normalizeViewState(tenantId, snapshot.processedSignals, snapshot.riskProfiles);
  },
  async refresh(tenantId: TenantId) {
    const orchestrator = buildSignalOrchestrator(tenantId, signalStore, repo);
    await orchestrator.execute({ tenantId });
  },
});

export const createSignalDashboardFromDefaults = (): SignalViewService => {
  const fallback: SignalRepository = {
    async findById() {
      return null;
    },
    async save(signal) {
      return undefined;
    },
    async deleteById() {
      return undefined;
    },
    async all() {
      return [];
    },
    async query() {
      return [];
    },
    async appendPlan() {
      return undefined;
    },
    async readPlans() {
      return [];
    },
    async readWindows() {
      return [];
    },
    async summarizeSignals() {
      return [];
    },
    async events() {
      return [];
    },
  };

  const repository = new RecoveryIncidentRepository();
  return createSignalDashboard(fallback, repository);
};
