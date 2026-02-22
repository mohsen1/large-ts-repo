import { useCallback, useMemo, useState } from 'react';
import { RecoveryWorkflowPlanner, RecoveryWorkflowRuntime } from '@service/recovery-workflow-orchestrator';
import { RecoveryWorkflowRepository, type WorkflowQueryResult } from '@data/recovery-workflow-store';
import { RecoveryIncidentOrchestrator } from '@service/recovery-incident-orchestrator';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { DashboardState } from '../types';
import type { IncidentId, IncidentRecord, IncidentPlanId } from '@domain/recovery-incident-orchestration';
import type { WorkflowBundle, WorkflowTemplate } from '@domain/recovery-incident-workflows';

export interface WorkflowGraphState {
  readonly loading: boolean;
  readonly bundles: readonly WorkflowBundle[];
  readonly selectedTenant: string;
  readonly errors: readonly string[];
  readonly summary: {
    readonly bundleCount: number;
    readonly runCount: number;
  };
}

interface UseIncidentWorkflowGraphOptions {
  readonly tenantId: string;
  readonly incident: IncidentRecord;
  readonly maxResults: number;
}

const buildRuntimeSnapshot = (bundles: readonly WorkflowBundle[]) => ({
  bundleCount: bundles.length,
  runCount: bundles.reduce((acc, bundle) => acc + bundle.runs.length, 0),
});

export const useIncidentWorkflowGraph = (
  repository: RecoveryIncidentRepository,
  options: UseIncidentWorkflowGraphOptions,
) => {
  const workflowRepo = useMemo(() => new RecoveryWorkflowRepository(), []);
  const planner = useMemo(
    () => new RecoveryWorkflowPlanner(repository, workflowRepo, new RecoveryIncidentOrchestrator({ repo: repository })),
    [repository],
  );
  const runtime = useMemo(
    () => new RecoveryWorkflowRuntime({
      tenantId: options.tenantId,
      namespace: `incident:${options.tenantId}`,
      maxConcurrentWorkflows: Math.max(1, options.maxResults),
    }, repository, workflowRepo, new RecoveryIncidentOrchestrator({ repo: repository })),
    [options.tenantId, options.maxResults, repository],
  );

  const [state, setState] = useState<WorkflowGraphState>({
    loading: false,
    bundles: [],
    selectedTenant: options.tenantId,
    errors: [],
    summary: { bundleCount: 0, runCount: 0 },
  });

  const plan = useCallback(async (): Promise<WorkflowBundle | null> => {
    setState((previous) => ({ ...previous, loading: true, errors: [] }));
    try {
      const result = await planner.planForIncident({
        incidentId: options.incident.id,
        forceRebuild: false,
        correlationId: `graph-${Date.now()}`,
      });
      if (!result) {
        setState((previous) => ({
          ...previous,
          loading: false,
          errors: ['plan-missing'],
          summary: buildRuntimeSnapshot(previous.bundles),
        }));
        return null;
      }
      if (!result.ok) {
        setState((previous) => ({
          ...previous,
          loading: false,
          errors: result.diagnostics,
          summary: buildRuntimeSnapshot(previous.bundles),
        }));
        return result.workflow;
      }

      setState((previous) => ({
        ...previous,
        loading: false,
        bundles: [...previous.bundles, result.workflow],
        summary: buildRuntimeSnapshot([...previous.bundles, result.workflow]),
      }));
      return result.workflow;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        errors: [...previous.errors, error instanceof Error ? error.message : 'plan-error'],
      }));
      return null;
    }
  }, [options.incident.id, planner]);

  const loadHistory = useCallback(async (): Promise<WorkflowQueryResult> => {
    const snapshot = await runtime.bootstrap();
    return snapshot;
  }, [runtime]);

  const runNode = useCallback(async (workflowId: string, runNodeId: string): Promise<IncidentId | null> => {
    const result = await runtime.run({
      incidentId: options.incident.id,
      workflowId,
      runNodeId,
    });
    return result.ok ? result.incidentId : null;
  }, [options.incident.id, runtime]);

  const promote = useCallback(
    async (incidentId: IncidentId, planId: IncidentPlanId): Promise<boolean> => {
      const plans = await repository.findPlans(incidentId);
      return plans.some((entry) => entry.id === planId);
    },
    [repository],
  );

  const summarizeState = useCallback(
    (dashboardState: DashboardState) => ({
      bundleCandidates: dashboardState.plans.length,
      unresolvedCount: dashboardState.incidents.filter((incident) => !incident.resolvedAt).length,
      templateCount: state.summary.bundleCount,
    }),
    [state.summary.bundleCount],
  );

  return {
    state,
    plan,
    runNode,
    loadHistory,
    promote,
    summarizeState,
  };
};
