import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRecoveryIncidentLabWorkspace } from './useRecoveryIncidentLabWorkspace';
import type { ControlPlaneState } from '../services/recoveryLabControlService';
import { useRecoveryLabControlService } from '../services/recoveryLabControlService';
import { dispatchControlChain, buildDispatchPlan } from '../services/recoveryLabPluginDispatcher';

type ControlPlaneMode = 'idle' | 'running' | 'ready' | 'error';

interface ControlPlaneSnapshot {
  readonly mode: ControlPlaneMode;
  readonly label: string;
  readonly eventCount: number;
}

interface PlanRow {
  readonly plugin: string;
  readonly priority: number;
}

interface RecoveryLabControlPlaneFacade {
  readonly workspace: ReturnType<typeof useRecoveryIncidentLabWorkspace>;
  readonly state: ControlPlaneState;
  readonly snapshot: ControlPlaneSnapshot;
  readonly canRun: boolean;
  readonly status: 'ready' | 'locked';
  readonly run: () => Promise<void>;
  readonly reset: () => void;
  readonly events: readonly string[];
}

const summarizeSnapshots = (snapshots: readonly PlanRow[]): {
  readonly maxPriority: number;
  readonly hasLowPriority: boolean;
} => {
  const maxPriority = snapshots.reduce((acc, snapshot) => Math.max(acc, snapshot.priority), 0);
  return {
    maxPriority,
    hasLowPriority: snapshots.some((snapshot) => snapshot.priority < 3),
  };
};

export const useRecoveryLabControlPlane = (): RecoveryLabControlPlaneFacade => {
  const workspace = useRecoveryIncidentLabWorkspace();
  const [state, setState] = useState<ControlPlaneState>(() => ({
    workspaceId: 'recovery-lab-control',
    stage: 'prepare',
    mode: 'idle',
    scenarioId: undefined,
    planId: undefined,
    runId: undefined,
    events: [],
    policies: [],
    timelineWarnings: [],
    diagnostics: [],
  }));
  const service = useRecoveryLabControlService(setState);

  const scenario = workspace.state.scenario;
  const plan = workspace.plan;

  const pluginPlan = useMemo(
    () => buildDispatchPlan(['prepare', 'execute', 'simulate', 'observe', 'close'] as const),
    [],
  );
  const snapshot = useMemo<ControlPlaneSnapshot>(() => {
    const summary = summarizeSnapshots(
      pluginPlan.map((entry) => ({
        plugin: `plugin-${entry.input}`,
        priority: entry.output,
      })),
    );
    return {
      mode: state.mode,
      label: `priority:${summary.maxPriority}`,
      eventCount: state.events.length,
    };
  }, [state.events.length, state.mode, pluginPlan]);

  useEffect(() => {
    if (!scenario || !plan) {
      return;
    }
    service.bootstrap('recovery-incident-lab-control');
  }, [plan, scenario, service]);

  const run = useCallback(async () => {
    if (!scenario || !plan) {
      return;
    }
    const dispatchPlan = await dispatchControlChain(scenario, Math.max(1, plan.selected.length));
    await service.runWithScenario(scenario, plan);
    const next = {
      ...state,
      diagnostics: [...state.diagnostics, ...dispatchPlan.warnings],
      events: [...state.events, ...dispatchPlan.events],
    };
    setState(next);
  }, [plan, scenario, service, state]);

  const reset = useCallback(() => {
    service.bootstrap('recovery-incident-lab-control-reset');
  }, [service]);

  const canRun = useMemo(() => state.mode !== 'running' && Boolean(scenario && plan), [state.mode, scenario, plan]);

  const status = useMemo(() => (canRun ? 'ready' : 'locked'), [canRun]);

  return {
    workspace,
    state,
    snapshot,
    canRun,
    status,
    run,
    reset,
    events: state.events,
  };
};
