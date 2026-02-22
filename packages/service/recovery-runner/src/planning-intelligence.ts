import {
  assessSlaCoverage,
  buildRecoveryChain,
  buildRunVelocity,
  buildSlaPlan,
  forecastCompletionWindow,
  mapChainToPlan,
  scoreVelocityProfile,
  type ChainPlan,
} from '@domain/recovery-orchestration';
import type {
  RecoveryProgram,
  RecoveryRunState,
  RecoveryCheckpoint,
  RecoveryStep,
} from '@domain/recovery-orchestration';
import { withBrand } from '@shared/core';
import type { IncidentId, IncidentRecord } from '@domain/recovery-incident-orchestration';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import {
  buildIncidentTrend,
  buildRepositoryPortfolio,
  buildResolutionProjections,
  buildSimulationEnvelope,
  forecastFromRuns,
  summarizeSimulationQuery,
} from '@data/recovery-incident-store';

type PlanSummary = {
  readonly id: string;
  readonly riskScore: number;
  readonly runCount: number;
  readonly signalDensity: number;
};

export interface PlanIntelligenceContext {
  readonly program: RecoveryProgram;
  readonly runState: RecoveryRunState;
  readonly checkpoints: readonly RecoveryCheckpoint[];
  readonly incidents: readonly IncidentRecord[];
  readonly steps: readonly RecoveryStep[];
}

export interface ProgramReadiness {
  readonly planId: string;
  readonly chainPlan: ChainPlan;
  readonly sla: ReturnType<typeof assessSlaCoverage>;
  readonly velocityScore: number;
  readonly completionWindow: ReturnType<typeof forecastCompletionWindow>;
}

export interface PortfolioDigest {
  readonly repositoryName: string;
  readonly tenantCount: number;
  readonly unhealthyPlanCount: number;
  readonly summaryPlan: string;
}

export class RecoveryPlanningCoordinator {
  constructor(private readonly repository: RecoveryIncidentRepository) {}

  async buildPlanReadiness(context: PlanIntelligenceContext): Promise<ProgramReadiness> {
    const checkpointWindow = [...context.checkpoints];
    const chain = buildRecoveryChain(context.program, context.runState);
    const chainPlan = mapChainToPlan(context.program, context.runState);
    const sla = assessSlaCoverage(context.program, context.runState, checkpointWindow);
    const velocity = buildRunVelocity(context.runState, context.program, checkpointWindow);
    const velocityScore = scoreVelocityProfile(velocity);
    const completionWindow = forecastCompletionWindow(context.runState, context.program, context.checkpoints);

    void buildSlaPlan(context.program, String(context.program.id));
    return {
      planId: String(context.program.id),
      chainPlan,
      sla,
      velocityScore,
      completionWindow,
    };
  }

  async buildPortfolioSummary(): Promise<PortfolioDigest> {
    const snapshot = await buildRepositoryPortfolio(this.repository);
    const plans = snapshot.entries;
    const runs = snapshot.entries.flatMap((entry) => snapshot.entries.filter((candidate) => candidate.incidentId === entry.incidentId).length ? [entry] : []);
    const healthy = plans.filter((entry) => entry.runCount === 0).length;
    const unhealthyPlanCount = plans.filter((entry) => entry.runCount > 0 && entry.unresolved).length;
    const tenantCount = snapshot.tenants.length;
    const summaryPlan = `${healthy}-${unhealthyPlanCount}`;
    const tenantSummary = `${tenantCount} tenants`;
    const repositoryName = `${tenantSummary} / ${summaryPlan}`;
    return {
      repositoryName,
      tenantCount,
      unhealthyPlanCount,
      summaryPlan,
    };
  }

  async buildIncidentReadiness(incidentId: string): Promise<readonly PlanSummary[]> {
    const typedIncidentId: IncidentId = withBrand(incidentId, 'IncidentId');
    const plans = await this.repository.findPlans(typedIncidentId);
    const planSignalDensity = plans.map((plan) => ({
      id: String(plan.id),
      riskScore: plan.plan.riskScore,
      runCount: plan.label.length,
      signalDensity: Number((plan.plan.riskScore / Math.max(1, plan.label.length)).toFixed(4)),
    }));
    return planSignalDensity.sort((left, right) => right.riskScore - left.riskScore);
  }

  async buildSimulationDigest(): Promise<{
    readonly envelope: ReturnType<typeof buildSimulationEnvelope>;
    readonly forecast: string;
  }> {
    const snapshot = this.repository.snapshot();
    const incidents = snapshot.incidents.map((snapshotEntry) => snapshotEntry.incident);
    const plans = snapshot.plans.map((entry) => entry.plan);
    const runs = snapshot.runs.map((entry) => entry.run);
    const envelope = buildSimulationEnvelope(incidents, plans, runs);
    const forecast = summarizeSimulationQuery({
      data: incidents,
      total: incidents.length,
    });
    const projection = forecastFromRuns(runs);
    const topPriority = projection[0];
    return {
      envelope,
      forecast: `${forecast}; top incident ${topPriority?.incidentId ?? 'none'}`,
    };
  }

  async runPlanHealthSignals(incidentId: string): Promise<readonly ReturnType<typeof buildResolutionProjections>[number][]> {
    const snapshot = this.repository.snapshot();
    const incidents = snapshot.incidents.map((snapshotEntry) => snapshotEntry.incident);
    const typedIncidentId: IncidentId = withBrand(incidentId, 'IncidentId');
    const plans = snapshot.plans.filter((plan) => plan.incidentId === typedIncidentId);
    const projections = buildResolutionProjections(incidents, plans);
    void buildIncidentTrend({
      total: incidents.length,
      data: incidents.filter((incident) => incident.id === typedIncidentId),
    });
    return projections;
  }
}

export const summarizePlans = (plans: readonly PlanSummary[]): string =>
  plans.map((plan) => `${plan.id}:${plan.runCount}`).join(',');

export const toReadonlyChain = (plan: ChainPlan): Readonly<ChainPlan> => plan;
