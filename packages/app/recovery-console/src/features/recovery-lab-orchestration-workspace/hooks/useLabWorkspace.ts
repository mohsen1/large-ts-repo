import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseLabWorkspaceArgs, UseLabWorkspaceResult } from '../types';
import {
  type LabCommand,
  type LabScenarioOverview,
  type LabSignalEvent,
  type LaneHealth,
  type LabWorkspaceState,
  type ScenarioToken,
  type PolicyToken,
} from '../types';
import { resolveWorkspace, loadCatalog, buildPlan, previewPlan } from '../services/labCatalogService';
import { runEngine } from '../services/recoveryLabEngine';
import { parseRuntimeId } from '@shared/recovery-orchestration-lab-runtime';

const initialOverview: LabScenarioOverview = {
  workspaceId: parseRuntimeId('ws', 'ws:tenant:global:default'),
  scenarioToken: 'scenario:tenant:global:baseline' as ScenarioToken,
  name: 'Recovery Baseline',
  mode: 'design',
  policyToken: 'policy:global:baseline' as PolicyToken,
  owner: 'ops-automation',
  updatedAt: new Date().toISOString(),
};

const seedState = (tenant: string, scenario: string): LabWorkspaceState => ({
  workspace: resolveWorkspace(tenant),
  runId: parseRuntimeId('run', `run:${tenant}:${scenario}`),
  overview: initialOverview,
  lanes: [
    {
      lane: `lane:${tenant}:critical`,
      score: 88,
      state: 'active',
    },
    {
      lane: `lane:${tenant}:standard`,
      score: 72,
      state: 'idle',
    },
  ],
  commands: [
    {
      id: 'cmd:assess',
      title: 'Assess incident envelope',
      stage: 'intake',
      enabled: true,
      weight: 6,
    },
    {
      id: 'cmd:simulate',
      title: 'Run continuity simulation',
      stage: 'simulate',
      enabled: true,
      weight: 9,
    },
  ],
  signals: [
    {
      label: 'latency',
      value: 42,
      at: new Date().toISOString(),
    },
  ],
});

export const useLabWorkspace = ({ workspace, scenario, tenant }: UseLabWorkspaceArgs): UseLabWorkspaceResult => {
  const [state, setState] = useState<LabWorkspaceState>(seedState(tenant, scenario));
  const [isBusy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<readonly string[]>([]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const catalog = await loadCatalog();
      const current = catalog.find((entry) => entry.tenant === tenant);
      const request = await previewPlan(tenant);
      const plan = await buildPlan(request);

      setState((previous) => ({
        ...previous,
        workspace: resolveWorkspace(tenant),
        overview: {
          ...previous.overview,
          workspaceId: parseRuntimeId('ws', `ws:${tenant}:${workspace}`),
          scenarioToken: `scenario:${tenant}:${scenario}` as ScenarioToken,
          name: current?.scenarioId ?? previous.overview.name,
          mode: 'simulate',
          owner: `owner:${tenant}`,
          updatedAt: new Date().toISOString(),
        },
        commands: previous.commands.map((command) => ({
          ...command,
          enabled: true,
        })),
      }));
      setWarnings(plan.warnings);
    } finally {
      setBusy(false);
    }
  }, [tenant, workspace, scenario]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const execute = useCallback(async () => {
    setBusy(true);
    try {
      const planResult = await runEngine({
        tenant,
        workspace,
        scenario,
        commands: state.commands.map((command) => command.id),
      });
      setState((previous) => ({
        ...previous,
        runId: planResult.runId,
        signals: [
          ...previous.signals,
          {
            label: 'run-score',
            value: planResult.score,
            at: new Date().toISOString(),
          },
        ],
        lanes: previous.lanes.map((lane) => ({
          ...lane,
          score: Math.min(100, lane.score + (planResult.score % 10)),
          state: planResult.outputCount > 0 ? 'active' : 'degraded',
        })),
      }));
      setWarnings(planResult.summary === 'completed' ? [] : ['execution incomplete']);
    } catch (error) {
      setWarnings((previous) => [...previous, String((error as Error).message)]);
    } finally {
      setBusy(false);
    }
  }, [tenant, workspace, scenario, state.commands]);

  const toggleCommand = useCallback((commandId: string) => {
    setState((previous) => ({
      ...previous,
      commands: previous.commands.map((command) =>
        command.id === commandId ? { ...command, enabled: !command.enabled } : command,
      ),
    }));
  }, []);

  const setMode = useCallback((mode: 'design' | 'simulate' | 'execute') => {
    setState((previous) => ({
      ...previous,
      overview: {
        ...previous.overview,
        mode,
      },
    }));
  }, []);

  const signals = state.signals;
  const lanes = state.lanes;
  const commands = state.commands;

  const derivedState = useMemo<LabWorkspaceState>(
    () => ({
      ...state,
      signals,
      lanes,
      commands,
    }),
    [state, signals, lanes, commands],
  );

  return {
    state: derivedState,
    isBusy,
    warnings,
    refresh,
    execute,
    toggleCommand,
    setMode,
  };
};
