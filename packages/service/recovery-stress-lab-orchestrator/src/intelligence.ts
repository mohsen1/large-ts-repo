import { StressLabOrchestrator } from './orchestrator';
import { buildScenarioWorkflow, buildScenarioWorkflow as buildWorkflow } from '@domain/recovery-stress-lab';
import { TenantId, RecoverySignal, CommandRunbook, WorkloadTopology, OrchestrationPlan, RecoverySimulationResult } from '@domain/recovery-stress-lab';
import { StressLabEngineConfig } from './types';
import { buildWorkspaceReport } from './reporting';

export interface IntelligenceSnapshot {
  readonly tenantId: TenantId;
  readonly health: 'ready' | 'degraded' | 'blocked';
  readonly reasons: ReadonlyArray<string>;
  readonly planState: 'absent' | 'available' | 'simulated';
  readonly runbooks: number;
  readonly recommendations: ReadonlyArray<string>;
}

export interface IntelligenceInput {
  readonly tenantId: TenantId;
  readonly config: StressLabEngineConfig;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly topology: WorkloadTopology;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
}

export const assessReadiness = (input: IntelligenceInput): IntelligenceSnapshot => {
  const blockers: string[] = [];
  if (input.runbooks.length === 0) blockers.push('no runbooks');
  if (input.signals.length === 0) blockers.push('no signals');
  if (input.topology.nodes.length === 0) blockers.push('no topology nodes');
  const workflow = buildScenarioWorkflow({
    tenantId: input.tenantId,
    band: input.config.band,
    runbooks: input.runbooks,
    signals: input.signals,
    requestedBy: `advisor:${input.tenantId}`,
  });
  const report = buildWorkspaceReport({
    tenantId: input.tenantId,
    plan: input.plan,
    simulation: input.simulation,
    topology: input.topology,
    runbooks: input.runbooks,
    signals: input.signals,
    config: input.config,
  });

  const recommendations = [
    ...blockers,
    ...workflow.blockers,
    ...report.recommendations.map((recommendation) => recommendation.message),
  ].slice(0, 5);

  const health = blockers.length > 1 ? 'blocked' : blockers.length > 0 ? 'degraded' : 'ready';
  const planState = !input.plan ? 'absent' : input.simulation ? 'simulated' : 'available';

  return {
    tenantId: input.tenantId,
    health,
    reasons: recommendations,
    planState,
    runbooks: input.runbooks.length,
    recommendations,
  };
};

export const runIntelligencePass = async (tenantId: TenantId, planbook: unknown) => {
  const orchestrator = new StressLabOrchestrator();
  return orchestrator.currentPlan(tenantId).then((plan) => ({ tenantId, plan, planbook, ready: Boolean(plan) }));
};

