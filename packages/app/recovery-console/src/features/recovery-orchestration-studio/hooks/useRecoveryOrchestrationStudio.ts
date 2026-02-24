import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type EngineTick,
  type EngineResult,
  type EngineConfig,
} from '@service/recovery-orchestration-studio-engine';
import {
  type RecoveryRunbook,
  type RecoveryScenarioTemplate,
  type StageNode,
} from '@domain/recovery-orchestration-design';
import { runStudio } from '../services/studioClient';
import {
  type StudioConfigForm,
  type StudioResultPanel,
  type StudioWorkspaceState,
  studioDefaultConfig,
  studioConfigToEngine,
} from '../types';

export interface UseRecoveryOrchestrationStudioInput {
  readonly tenant: string;
  readonly workspace: string;
  readonly initialRunbook?: RecoveryRunbook;
  readonly template?: RecoveryScenarioTemplate;
}

export interface UseRecoveryOrchestrationStudioResult {
  readonly state: StudioWorkspaceState;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly refresh: () => Promise<void>;
  readonly config: StudioConfigForm;
  readonly setConfig: (next: StudioConfigForm) => void;
}

const makeSummary = (runbook?: RecoveryRunbook): StudioWorkspaceState['summary'] => {
  if (!runbook) {
    return undefined;
  }
  const status = Object.values(runbook.nodes.reduce<Record<StageNode['status'], number>>((acc, node) => {
    acc[node.status] = (acc[node.status] ?? 0) + 1;
    return acc;
  }, { pending: 0, active: 0, suppressed: 0, complete: 0 }));
  return {
    tenant: runbook.tenant,
    workspace: runbook.workspace,
    nodeCount: runbook.nodes.length,
    edgeCount: runbook.edges.length,
    isHealthy: (status[0] ?? 0) >= 1,
  };
};

const makeTickState = (result: EngineResult): {
  ticks: readonly EngineTick[];
  panel: StudioResultPanel;
} => ({
  ticks: result.ticks,
  panel: {
    result,
    elapsedMs: Math.max(0, new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime()),
    phaseCount: result.ticks.length,
    status: result.ticks.length > 1 ? 'done' : 'starting',
  },
});

export const useRecoveryOrchestrationStudio = (
  input: UseRecoveryOrchestrationStudioInput,
): UseRecoveryOrchestrationStudioResult => {
  const [config, setConfig] = useState<StudioConfigForm>(studioDefaultConfig);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EngineResult | undefined>(undefined);
  const [ticks, setTicks] = useState<readonly EngineTick[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [actions, setActions] = useState<readonly { id: 'start' | 'stop' | 'refresh' | 'snapshot'; at: string }[]>([]);
  const summary = makeSummary(input.initialRunbook);

  const appendAction = (id: 'start' | 'stop' | 'refresh' | 'snapshot') =>
    setActions((previous) => [...previous, { id, at: new Date().toISOString() }].slice(-20));

  const executeRun = useCallback(async () => {
    try {
      appendAction('start');
      setRunning(true);
      setError(undefined);
      const response = await runStudio({
        runbook: input.initialRunbook,
        config: studioConfigToEngine(config),
      });
      setResult(response.result);
      setTicks(response.result.ticks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'studio-run-failed');
      setTicks([]);
    } finally {
      setRunning(false);
      appendAction('snapshot');
    }
  }, [config, input.initialRunbook]);

  const stop = () => {
    appendAction('stop');
    setRunning(false);
  };

  const refresh = useCallback(async () => {
    appendAction('refresh');
    if (running) {
      return;
    }
    await executeRun();
  }, [executeRun, running]);

  useEffect(() => {
    void refresh();
  }, [input.initialRunbook, input.workspace, input.tenant]);

  const state: StudioWorkspaceState = useMemo(
    () => ({
      loaded: !running && summary !== undefined,
      runbook: input.initialRunbook,
      template: input.template,
      ticks,
      summary,
      isRunning: running,
      actions,
    }),
    [running, summary, input.initialRunbook, input.template, ticks, actions],
  );

  return {
    state,
    start: executeRun,
    stop,
    refresh,
    config,
    setConfig: (next: StudioConfigForm) => setConfig({ ...next, tenant: input.tenant, workspace: input.workspace }),
  };
};
