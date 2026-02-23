import { useCallback, useMemo, useState } from 'react';
import { buildDependencySeed, buildScenarioFromSeed } from '@data/recovery-workload-store';
import type { ForecastInput } from '@domain/recovery-workload-intelligence';
import { summarizeSignals, simulateWorkloadDrill, buildTopology, calculateCoverageForWindow } from '@domain/recovery-workload-intelligence';

export interface ForecastWorkspace {
  readonly tenantId: string;
  readonly lookbackDays: number;
  readonly samples: number;
  readonly criticalOnly: boolean;
}

export interface ForecastWorkspaceSnapshot {
  readonly risk: number;
  readonly alertCount: number;
  readonly windowCount: number;
  readonly topNodes: readonly string[];
  readonly topologyDepth: number;
}

const defaultWorkspace: ForecastWorkspace = {
  tenantId: 'tenant-a',
  lookbackDays: 14,
  samples: 14,
  criticalOnly: false,
};

export const useWorkloadForecast = (initial: ForecastWorkspace = defaultWorkspace) => {
  const [workspace, setWorkspace] = useState<ForecastWorkspace>(initial);
  const [inputs, setInputs] = useState<readonly ForecastInput[]>(() => buildScenarioFromSeed(initial.tenantId, initial.samples));

  const setCriticalOnly = useCallback((value: boolean) => {
    setWorkspace((current) => ({ ...current, criticalOnly: value }));
  }, []);

  const setTenant = useCallback((tenantId: string) => {
    setWorkspace((current) => ({ ...current, tenantId }));
    setInputs(buildScenarioFromSeed(tenantId, workspace.samples));
  }, [workspace.samples]);

  const setSamples = useCallback((samples: number) => {
    setWorkspace((current) => ({ ...current, samples: Math.max(1, samples) }));
    setInputs((_) => buildScenarioFromSeed(workspace.tenantId, samples));
  }, [workspace.tenantId]);

  const setLookback = useCallback((days: number) => {
    setWorkspace((current) => ({ ...current, lookbackDays: Math.max(1, days) }));
  }, []);

  const summary = useMemo<ForecastWorkspaceSnapshot>(() => {
    const graph = buildDependencySeed(workspace.tenantId, Math.max(4, workspace.samples));
    const filtered = inputs.filter((input) => {
      if (!workspace.criticalOnly) {
        return true;
      }
      return input.node.criticality >= 4;
    });
    const snapshots = filtered.map((input) => input.snapshot);
    const topology = buildTopology(graph);
    const simulation = simulateWorkloadDrill({ snapshot: filtered, graph });
    const alertCount = simulation.plans.filter((plan) => plan.coverage < 0.5).length;
    const riskProfiles = filtered.flatMap((input) => summarizeSignals(input.node, [input.snapshot]).windows)
      .filter((window) => window.p95 > 0);
    const risk = riskProfiles.length === 0
      ? 0
      : riskProfiles.reduce((acc, entry) => acc + entry.avg, 0) / riskProfiles.length / 100;
    return {
      risk,
      alertCount,
      windowCount: simulation.plans.length,
      topNodes: simulation.hotNodes.slice(-5),
      topologyDepth: topology.layers.length,
    };
  }, [inputs, workspace.criticalOnly, workspace.tenantId, workspace.samples]);

  const refresh = useCallback(async () => {
    setInputs(buildScenarioFromSeed(workspace.tenantId, workspace.samples));
  }, [workspace.tenantId, workspace.samples]);

  const coverage = useMemo(() => {
    const snapshotList = inputs.map((entry) => entry.snapshot);
    return calculateCoverageForWindow(buildDependencySeed(workspace.tenantId, Math.max(3, workspace.samples)), snapshotList);
  }, [inputs, workspace.tenantId, workspace.samples]);

  return {
    workspace,
    inputs,
    summary,
    coverage: coverage.overall,
    setTenant,
    setSamples,
    setCriticalOnly,
    setLookback,
    refresh,
  };
};
