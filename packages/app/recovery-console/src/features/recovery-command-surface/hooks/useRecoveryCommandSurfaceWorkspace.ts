import { useEffect, useMemo, useState } from 'react';

import { upsertPlan, startRun, listWorkspace } from '../services/recoveryCommandSurfaceService';
import type { RecoveryCommandSurfaceFilters, RecoveryCommandSurfaceWorkspace } from '../types';
import type { SimulationProjection } from '../types';
import { buildCommandSurfaceId, buildSurfacePlanId, type CommandSurfacePlanId } from '@domain/recovery-command-surface-models';

export interface SurfaceWorkspaceApi {
  readonly load: (filters?: RecoveryCommandSurfaceFilters) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly startRun: (planId: CommandSurfacePlanId) => Promise<void>;
  readonly clearSelection: () => void;
}

export interface SurfaceWorkspaceState {
  readonly workspace: RecoveryCommandSurfaceWorkspace;
  readonly loading: boolean;
  readonly errors: readonly string[];
  readonly projection: SimulationProjection | undefined;
  readonly signalCount: number;
}

const emptyWorkspace = (tenant = 'default'): RecoveryCommandSurfaceWorkspace => ({
  tenant,
  scopeLabel: `${tenant}-surface`,
  plans: [],
  runs: [],
  selectedPlanId: null,
  selectedRunId: null,
  running: false,
});

export const useRecoveryCommandSurfaceWorkspace = (
  tenant: string,
  initialFilters: RecoveryCommandSurfaceFilters = {},
): SurfaceWorkspaceState & SurfaceWorkspaceApi => {
  const [workspace, setWorkspace] = useState<RecoveryCommandSurfaceWorkspace>(() => emptyWorkspace(tenant));
  const [loading, setLoading] = useState<boolean>(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [projection, setProjection] = useState<SimulationProjection | undefined>(undefined);
  const [signalCount, setSignalCount] = useState<number>(0);

  const load = async (filters: RecoveryCommandSurfaceFilters = initialFilters): Promise<void> => {
    try {
      setLoading(true);
      const state = await listWorkspace({ ...filters, tenant });
      setWorkspace({
        tenant: state.tenant,
        scopeLabel: state.scopeLabel,
        plans: state.plans,
        runs: state.runs,
        selectedPlanId: state.selectedPlanId,
        selectedRunId: state.selectedRunId,
        running: state.running,
      });
      setSignalCount(state.signalCount);
      setErrors([]);
    } catch (error) {
      setErrors([`load failed: ${String((error as Error).message ?? error)}`]);
    } finally {
      setLoading(false);
    }
  };

  const hydrateProjection = async (): Promise<void> => {
    if (!workspace.selectedRunId) {
      setProjection(undefined);
      return;
    }
    const projection: SimulationProjection = {
      planId: workspace.selectedPlanId ?? '',
      runId: workspace.selectedRunId,
      forecast: undefined,
      projection: undefined,
    };
    setProjection(projection);
  };

  const startSurfaceRun = async (planId: CommandSurfacePlanId): Promise<void> => {
    try {
      setLoading(true);
      const created = await startRun(tenant, planId, 'operator', 'automated-readiness');
      setErrors([]);
      await load({ ...initialFilters, tenant, planId: created.planId });
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = (): void => {
    setWorkspace((current) => ({
      ...current,
      selectedPlanId: null,
      selectedRunId: null,
    }));
    setProjection(undefined);
  };

  const refresh = async (): Promise<void> => {
    await load(initialFilters);
  };

  useEffect(() => {
    const planId = buildSurfacePlanId(tenant, Date.now());
    const stabilizeCommandId = buildCommandSurfaceId(planId, 'stabilize');
    const rollbackCommandId = buildCommandSurfaceId(planId, 'rollback');
    void upsertPlan({
      id: planId,
      name: `${tenant} incident surface`,
      surface: {
        tenant,
        region: 'us-east-1',
        zone: '1a',
        accountId: 'acct-demo',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      commands: [
        {
          id: stabilizeCommandId,
          title: 'Stabilize',
          kind: 'stabilize',
          instructions: ['pause-ingress', 'drain-edges'],
          inputs: [
            {
              command: 'stabilize',
              arguments: {
                tenant,
                zone: '1a',
              },
              priority: 1,
              expectedDurationMinutes: 7,
            },
          ],
          safetyTags: ['critical'],
          requiresApproval: false,
        },
        {
          id: rollbackCommandId,
          title: 'Rollback',
          kind: 'rollback',
          instructions: ['switch-revision', 'restore-state'],
          inputs: [
            {
              command: 'rollback',
              arguments: {
                tenant,
                region: 'us-east-1',
              },
              priority: 2,
              expectedDurationMinutes: 4,
            },
          ],
          safetyTags: ['safe'],
          requiresApproval: true,
        },
      ],
      dependencies: [
        {
          from: stabilizeCommandId,
          to: rollbackCommandId,
          latencyMs: 1800,
          requiredReadiness: 0.72,
        },
      ],
      constraints: {
        maxInFlight: 1,
        maxRisk: 5,
        allowedDowntimeMinutes: 11,
      },
    }).catch((error) => {
      setErrors([`seed plan failed: ${String((error as Error).message)}`]);
    });
    void load(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  useEffect(() => {
    void hydrateProjection();
  }, [workspace.selectedRunId, workspace.selectedPlanId]);

  const summary = useMemo(
    () => ({
      workspace,
      loading,
      errors,
      projection,
      signalCount,
      load,
      refresh,
      startRun: startSurfaceRun,
      clearSelection,
    }),
    [workspace, loading, errors, projection, signalCount, load, refresh],
  );

  return summary;
};
