import type { RecoverySimulationResult, OrchestrationPlan, TenantId, RecoverySignal, CommandRunbook } from '@domain/recovery-stress-lab';
import { InMemoryPersistence, ConsoleAuditSink } from '@domain/recovery-stress-lab';
import { StressLabDecision } from './types';

export interface StressLabMeshAdapters {
  readonly persistence: InMemoryPersistence;
  readonly audit: ConsoleAuditSink;
  readonly signalAdapter?: SignalAdapter;
  readonly reportAdapter?: ReportAdapter;
}

export interface SignalAdapter {
  fetchSignals(tenantId: TenantId): Promise<readonly RecoverySignal[]>;
  fetchRunbooks(tenantId: TenantId): Promise<readonly CommandRunbook[]>;
}

export interface ReportAdapter {
  publishReport(report: StressLabMeshReport): Promise<void>;
}

export interface StressLabMeshReport {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly decision: StressLabDecision;
  readonly generatedAt: string;
  readonly warnings: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface MeshOperatorState {
  readonly tenantId: TenantId;
  readonly hasPlan: boolean;
  readonly hasSimulation: boolean;
  readonly persistedPlan: boolean;
  readonly persistedSimulation: boolean;
  readonly warnings: readonly string[];
}

export const buildMeshState = (tenantId: TenantId, decision: StressLabDecision): MeshOperatorState => {
  return {
    tenantId,
    hasPlan: Boolean(decision.plan),
    hasSimulation: Boolean(decision.simulation),
    persistedPlan: false,
    persistedSimulation: false,
    warnings: decision.errors,
  };
};

export const persistDecision = async (
  adapters: StressLabMeshAdapters,
  tenantId: TenantId,
  decision: StressLabDecision,
): Promise<MeshOperatorState> => {
  if (!decision.plan || !decision.simulation) {
    await adapters.audit.emit('stress-lab-mesh-missing-artifacts', {
      tenantId,
      warnings: decision.errors.join(';'),
      hasPlan: Boolean(decision.plan),
      hasSimulation: Boolean(decision.simulation),
    });
    return buildMeshState(tenantId, decision);
  }

  await adapters.persistence.savePlan(tenantId, decision.plan);
  await adapters.persistence.saveSimulation(tenantId, decision.simulation);

  await adapters.audit.emit('stress-lab-mesh-persisted', {
    tenantId,
    planId: decision.plan?.scenarioName,
    simulationSignals: decision.simulation.ticks.length,
  });

  return {
    tenantId,
    hasPlan: true,
    hasSimulation: true,
    persistedPlan: true,
    persistedSimulation: true,
    warnings: decision.errors,
  };
};

export const publishMeshReport = async (
  adapters: StressLabMeshAdapters,
  report: StressLabMeshReport,
): Promise<MeshOperatorState> => {
  if (adapters.reportAdapter) {
    await adapters.reportAdapter.publishReport(report);
  }
  await adapters.audit.emit('stress-lab-mesh-report', {
    tenantId: report.tenantId,
    decision: report.decision.plan ? report.decision.plan.scenarioName : 'none',
    timestamp: report.generatedAt,
    warningCount: report.warnings.length,
  });
  return {
    tenantId: report.tenantId,
    hasPlan: Boolean(report.plan),
    hasSimulation: Boolean(report.simulation),
    persistedPlan: true,
    persistedSimulation: true,
    warnings: report.warnings,
  };
};
