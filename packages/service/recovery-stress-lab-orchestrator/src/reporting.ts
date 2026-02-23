import { buildStressForecast, buildStressMetricReport } from '@domain/recovery-stress-lab';
import { RecoverySimulationResult, OrchestrationPlan, RecoverySignal, TenantId, WorkloadTopology, CommandRunbook } from '@domain/recovery-stress-lab';
import { StressLabEngineConfig, StressLabWorkspace } from './types';

export interface WorkspaceReport {
  readonly tenantId: TenantId;
  readonly summary: {
    readonly planRunbooks: number;
    readonly signalCount: number;
    readonly readinessBand: 'low' | 'medium' | 'high' | 'critical';
  };
  readonly workflow: {
    readonly hasPlan: boolean;
    readonly hasSimulation: boolean;
    readonly risk: number;
    readonly sla: number;
  };
  readonly forecast: ReturnType<typeof buildStressForecast>;
  readonly recommendations: ReadonlyArray<{ code: string; message: string }>;
}

export interface BuildWorkspaceInput {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly topology: WorkloadTopology;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly config: StressLabEngineConfig;
}

const toRecommendation = (message: string, index: number) => ({
  code: `R-${String(index).padStart(3, '0')}`,
  message,
});

const readBand = (simulation: RecoverySimulationResult | null): 'low' | 'medium' | 'high' | 'critical' => {
  if (!simulation) return 'low';
  if (simulation.riskScore > 0.66) return 'critical';
  if (simulation.riskScore > 0.33) return 'high';
  return simulation.slaCompliance < 0.5 ? 'high' : 'medium';
};

export const buildWorkspaceReport = (input: BuildWorkspaceInput): WorkspaceReport => {
  const forecast = buildStressForecast({
    tenantId: input.tenantId,
    band: readBand(input.simulation),
    topology: input.topology,
    signals: input.signals,
    windowMinutes: 20,
  });
  const metrics = buildStressMetricReport(
    String(input.tenantId),
    input.signals,
    input.topology,
    input.simulation,
    input.plan,
    input.runbooks,
  );

  const recommendations: Array<{ code: string; message: string }> = [];
  const warnings = [
    ...new Set(metrics.signalHealth.classCoverage.map((entry) => `${entry.key}:${entry.value}`)),
    `window-trend=${forecast.trend}`,
    `confidence=${forecast.confidence.toFixed(2)}`,
    `topology-risk=${metrics.topologyHealth.highRiskNodes}`,
  ];
  let index = 0;
  for (const message of warnings) {
    if (message.length > 0) {
      recommendations.push(toRecommendation(message, index += 1));
    }
  }

  return {
    tenantId: input.tenantId,
    summary: {
      planRunbooks: input.runbooks.length,
      signalCount: input.signals.length,
      readinessBand: readBand(input.simulation),
    },
    workflow: {
      hasPlan: Boolean(input.plan),
      hasSimulation: Boolean(input.simulation),
      risk: input.simulation?.riskScore ?? 0,
      sla: input.simulation?.slaCompliance ?? 0,
    },
    forecast,
    recommendations,
  };
};

export interface WorkspaceDiff {
  readonly tenantId: TenantId;
  readonly hasComparison: boolean;
  readonly scoreDelta: number;
  readonly topRiskChanged: boolean;
}

export const compareWorkspaceReports = (
  left: WorkspaceReport,
  right: WorkspaceReport,
): WorkspaceDiff => {
  const leftRisk = left.workflow.risk;
  const rightRisk = right.workflow.risk;
  const scoreDelta = rightRisk - leftRisk;
  const topRiskChanged = left.forecast.peakLoad !== right.forecast.peakLoad;
  return {
    tenantId: right.tenantId,
    hasComparison: left.forecast.peakLoad !== right.forecast.peakLoad || left.summary.planRunbooks !== right.summary.planRunbooks,
    scoreDelta,
    topRiskChanged,
  };
};

export const compactWorkspace = (workspace: StressLabWorkspace): string[] => {
  return [
    workspace.tenantId,
    `runbooks=${workspace.runbooks.length}`,
    `signals=${workspace.knownSignals.length}`,
    `profile=${workspace.config.band}`,
    `targets=${workspace.targetWorkloads.length}`,
  ];
};
