import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import {
  type IncidentId,
  type IncidentPlan,
  type IncidentRecord,
} from '@domain/recovery-incident-orchestration';
import {
  RecoveryCommandOrchestrator,
  type CommandOrchestratorContext,
  type CommandOrchestratorConfig,
  type CommandOrchestratorReport,
  type CommandOrchestratorRun,
} from '@service/recovery-command-orchestrator';
import type { DashboardIncident } from '../types';
import { summarizeState, type DashboardSummary } from './useIncidentDashboard';

export interface CommandWorkspaceConfig {
  readonly operator: string;
  readonly tenantId: string;
}

export interface CommandWorkspaceState {
  readonly incidents: readonly DashboardIncident[];
  readonly selectedIncidentId: IncidentId | undefined;
  readonly selectedPlanId: IncidentPlan['id'] | undefined;
  readonly prepared: CommandOrchestratorRun | undefined;
  readonly report: CommandOrchestratorReport | undefined;
  readonly status: 'idle' | 'loading' | 'error' | 'ready';
  readonly errors: readonly string[];
  readonly statusLine: string;
}

export const useIncidentCommandWorkspace = (
  repository: RecoveryIncidentRepository,
  config: CommandWorkspaceConfig,
) => {
  const orchestrator = useMemo(
    () =>
      new RecoveryCommandOrchestrator(repository, {
        mode: 'simulation',
        maxQueued: 8,
        maxParallelism: 3,
        policy: {
          includeNotifyOnly: true,
          maxParallelism: 3,
          minimumReadinessScore: 6,
          maxRiskScore: 10,
          includeRollbackWindowMinutes: 45,
        },
      } satisfies CommandOrchestratorConfig),
    [repository],
  );

  const [state, setState] = useState<CommandWorkspaceState>({
    incidents: [],
    selectedIncidentId: undefined,
    selectedPlanId: undefined,
    prepared: undefined,
    report: undefined,
    status: 'idle',
    errors: [],
    statusLine: 'Workspace initialized',
  });

  const refresh = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading', errors: [] }));
    try {
      const response = await repository.findIncidents({ tenantId: config.tenantId, limit: 50 });
      const incidents: DashboardIncident[] = response.data.map((incident) => ({
        ...incident,
        lastSeenAt: new Date().toISOString(),
        runCount: 0,
      }));
      setState((previous) => ({
        ...previous,
        incidents,
        status: 'ready',
        statusLine: `Loaded ${incidents.length} incidents`,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        statusLine: 'Failed to refresh incidents',
        errors: [...previous.errors, error instanceof Error ? error.message : 'unknown'],
      }));
    }
  }, [config.tenantId, repository]);

  const selectIncident = useCallback(async (incidentId: IncidentId) => {
    const candidate = state.incidents.find((incident) => incident.id === incidentId);
    if (!candidate) {
      return;
    }
    const plans = await repository.findPlans(incidentId);
    const activePlan = plans.find((entry) => entry.plan.approved) ?? plans[plans.length - 1];
    setState((previous) => ({
      ...previous,
      selectedIncidentId: incidentId,
      selectedPlanId: activePlan?.id,
      statusLine: `selected ${candidate.id} plan ${activePlan ? activePlan.id : 'none'}`,
      prepared: undefined,
      report: undefined,
    }));
  }, [repository, state.incidents]);

  const prepare = useCallback(async () => {
    if (!state.selectedIncidentId || !state.selectedPlanId) {
      setState((previous) => ({
        ...previous,
        errors: [...previous.errors, 'Select an incident and an approved plan first'],
      }));
      return;
    }

    setState((previous) => ({ ...previous, status: 'loading' }));
    try {
      const runContext: CommandOrchestratorContext = {
        incidentId: state.selectedIncidentId,
        planId: state.selectedPlanId,
        operator: config.operator,
      };
      const prepared = await orchestrator.prepareRun(runContext);
      setState((previous) => ({
        ...previous,
        prepared,
        status: 'ready',
        statusLine: summarizeState({
          incidents: previous.incidents,
          plans: [],
          runs: [],
          status: 'ready',
          errors: [],
        }),
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        statusLine: 'Prepare failed',
        errors: [...previous.errors, error instanceof Error ? error.message : 'unknown'],
      }));
    }
  }, [config.operator, orchestrator, state.selectedIncidentId, state.selectedPlanId, state.incidents]);

  const execute = useCallback(async () => {
    if (!state.selectedIncidentId || !state.selectedPlanId) {
      return;
    }
    setState((previous) => ({ ...previous, status: 'loading' }));
    try {
      const runContext: CommandOrchestratorContext = {
        incidentId: state.selectedIncidentId,
        planId: state.selectedPlanId,
        operator: config.operator,
      };
      const report = await orchestrator.executeRun(runContext);
      setState((previous) => ({
        ...previous,
        report,
        status: 'ready',
        statusLine: `Executed ${report.executedRuns} commands`,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        statusLine: 'Execute failed',
        errors: [...previous.errors, error instanceof Error ? error.message : 'unknown'],
      }));
    }
  }, [config.operator, orchestrator, state.selectedIncidentId, state.selectedPlanId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    state,
    actions: {
      refresh,
      selectIncident,
      prepare,
      execute,
    },
  };
};
