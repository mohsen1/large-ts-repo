import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardActions, DashboardState, DashboardIncident } from './types';
import type { IncidentId, IncidentPlan } from '@domain/recovery-incident-orchestration';
import { RecoveryIncidentOrchestrator } from '@service/recovery-incident-orchestrator';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';

export const useDashboardState = (repo: RecoveryIncidentRepository): {
  state: DashboardState;
  actions: DashboardActions;
} => {
  const [state, setState] = useState<DashboardState>({
    incidents: [],
    plans: [],
    runs: [],
    status: 'idle',
    errors: [],
  });

  const orchestrator = useMemo(() => new RecoveryIncidentOrchestrator({
    repo,
  }), [repo]);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading', errors: [] }));
    try {
      const query = await repo.findIncidents({ limit: 20, unresolvedOnly: true });
      const incidents: DashboardIncident[] = query.data.map((item) => ({
        ...item,
        lastSeenAt: new Date().toISOString(),
        runCount: 0,
      }));

      const planEntries = await Promise.all(
        incidents.map(async (incident) => {
          const planRecords = await repo.findPlans(incident.id);
          const latest = planRecords[planRecords.length - 1];
          if (!latest) {
            return undefined;
          }
          return {
            planId: latest.id,
            incidentId: latest.incidentId,
            title: latest.label,
            approved: false,
            runCount: (await repo.getRuns(latest.incidentId)).length,
          };
        }),
      );
      const plans = planEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      const runEntries = await Promise.all(
        incidents.map(async (incident) => {
          const runs = await repo.getRuns(incident.id);
          return runs.map((run) => ({
            planId: run.planId,
            runId: run.id,
            nodeId: run.nodeId,
            state: run.state,
            startedAt: run.startedAt,
          }));
        }),
      );

      setState({
        incidents,
        plans,
        runs: runEntries.flat(),
        status: 'ready',
        errors: [],
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        errors: [
          ...prev.errors,
          error instanceof Error ? error.message : 'unknown refresh error',
        ],
      }));
    }
  }, [repo]);

  const execute = useCallback(async (incidentId: IncidentId) => {
    const plan = await orchestrator.planForIncident(incidentId, 'dashboard-click');
    if (!plan) {
      setState((prev) => ({
        ...prev,
        errors: [...prev.errors, `plan not found for ${incidentId}`],
      }));
      return;
    }

    const result = await orchestrator.executeIncidentPlan(plan);
    setState((prev) => ({
      ...prev,
      plans: prev.plans.map((entry) =>
        entry.planId === plan.id
          ? {
              ...entry,
              approved: result.approved,
              runCount: result.runs.length,
            }
          : entry,
      ),
      runs: [
        ...prev.runs,
        ...result.runs.map((run) => ({
          planId: run.planId,
          runId: run.id,
          nodeId: run.nodeId,
          state: run.state,
          startedAt: run.startedAt,
        })),
      ],
    }));
  }, [orchestrator]);

  const promote = useCallback(async (planId: IncidentPlan['id']) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    setState((prev) => ({
      ...prev,
      plans: prev.plans.map((entry) =>
        entry.planId === planId
          ? {
              ...entry,
              approved: true,
            }
          : entry,
      ),
    }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const actions: DashboardActions = {
    refresh,
    execute,
    promote,
  };

  return { state, actions };
};
