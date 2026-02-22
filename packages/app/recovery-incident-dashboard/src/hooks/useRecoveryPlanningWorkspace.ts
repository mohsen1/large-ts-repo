import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryPlanningCoordinator, type PortfolioDigest, summarizePlans } from '@service/recovery-runner';
import type { IncidentPlan } from '@domain/recovery-incident-orchestration';

export interface PlanningLane {
  readonly incidentId: string;
  readonly planId: IncidentPlan['id'];
  readonly riskScore: number;
  readonly runCount: number;
  readonly signalDensity: number;
}

export interface PlanningWorkspaceState {
  readonly loading: boolean;
  readonly tenantCount: number;
  readonly portfolioDigest?: PortfolioDigest;
  readonly lanes: readonly PlanningLane[];
  readonly summaryLine: string;
  readonly refreshToken: number;
}

export interface PlanningWorkspaceActions {
  readonly refresh: () => Promise<void>;
  readonly loadIncident: (incidentId: string) => Promise<void>;
}

export const useRecoveryPlanningWorkspace = (repository: RecoveryIncidentRepository) => {
  const coordinator = useMemo(() => new RecoveryPlanningCoordinator(repository), [repository]);
  const [state, setState] = useState<PlanningWorkspaceState>({
    loading: false,
    tenantCount: 0,
    lanes: [],
    summaryLine: '',
    refreshToken: 0,
  });

  const refresh = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true }));
    const digest = await coordinator.buildPortfolioSummary();
    const plans = await coordinator.buildIncidentReadiness('*');
    const lanes: PlanningLane[] = plans.map((plan) => ({
      incidentId: '*',
      planId: plan.id as IncidentPlan['id'],
      riskScore: plan.riskScore,
      runCount: plan.runCount,
      signalDensity: plan.signalDensity,
    }));
    setState({
      loading: false,
      tenantCount: digest.tenantCount,
      portfolioDigest: digest,
      lanes,
      summaryLine: `${digest.repositoryName} | summary=${summarizePlans(plans)}`,
      refreshToken: state.refreshToken + 1,
    });
  }, [coordinator, state.refreshToken]);

  const loadIncident = useCallback(async (incidentId: string) => {
    const plans = await coordinator.buildIncidentReadiness(incidentId);
    setState((previous) => ({
      ...previous,
      lanes: plans.map((plan) => ({
        incidentId,
        planId: plan.id as IncidentPlan['id'],
        riskScore: plan.riskScore,
        runCount: plan.runCount,
        signalDensity: plan.signalDensity,
      })),
      summaryLine: `${incidentId}: ${plans.length}`,
    }));
  }, [coordinator]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, actions: { refresh, loadIncident } as PlanningWorkspaceActions };
};
