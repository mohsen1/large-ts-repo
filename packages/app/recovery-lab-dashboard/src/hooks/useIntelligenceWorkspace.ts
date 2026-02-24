import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrchestrationMode, OrchestrationLane } from '@domain/recovery-lab-intelligence-core';
import {
  hydrateScenarioIds,
  runWorkspaceIntelligence,
  runSeedDefaults,
  summarizeRuns,
  strategyLaneLabels,
  strategyModeLabels,
  parseRunTarget,
  type IntelligenceServiceState,
} from '../services/intelligenceService';

interface IntelligenceState {
  readonly tenant: string;
  readonly scenario: string;
  readonly loading: boolean;
  readonly mode: OrchestrationMode;
  readonly lane: OrchestrationLane;
  readonly seedHistory: readonly string[];
  readonly timeline: readonly string[];
  readonly eventCount: number;
  readonly registryCount: number;
  readonly registryRoute: string;
  readonly planSummary: string;
  readonly outputScore: number;
  readonly laneLabel: string;
  readonly modeLabel: string;
  readonly runId: string;
  readonly lastRuns: IntelligenceServiceState['seedRuns'];
  readonly summary: ReturnType<typeof summarizeRuns>;
  readonly start: () => Promise<void>;
  readonly setTenant: (tenant: string) => void;
  readonly setScenario: (scenario: string) => void;
  readonly setMode: (mode: OrchestrationMode) => void;
  readonly setLane: (lane: OrchestrationLane) => void;
}

export const useIntelligenceWorkspace = (): IntelligenceState => {
  const [tenant, setTenantState] = useState(runSeedDefaults.tenant);
  const [scenario, setScenarioState] = useState(runSeedDefaults.scenario);
  const [mode, setModeState] = useState<OrchestrationMode>(runSeedDefaults.mode);
  const [lane, setLaneState] = useState<OrchestrationLane>(runSeedDefaults.lane);
  const [loading, setLoading] = useState(false);
  const [serviceState, setServiceState] = useState<IntelligenceServiceState | null>(null);
  const [seedHistory, setSeedHistory] = useState<readonly string[]>([]);

  const scenarios = useMemo(() => hydrateScenarioIds(tenant), [tenant]);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runWorkspaceIntelligence({
        tenant,
        scenario,
        mode,
        lane,
        repeats: 3,
        extra: {
          target: parseRunTarget(scenario),
          initiatedBy: 'ui',
          scenarioCount: scenarios.length,
        },
      });
      setServiceState(result);
      setSeedHistory((previous) =>
        [
          ...previous,
          `${new Date().toISOString()}::${tenant}::${scenario}::${mode}::${lane}::${result.eventCount}`,
        ].toReversed().slice(0, 20).toReversed(),
      );
    } finally {
      setLoading(false);
    }
  }, [tenant, scenario, mode, lane, scenarios]);

  const setTenant = useCallback((value: string) => {
    setTenantState(value.trim() || runSeedDefaults.tenant);
  }, []);

  const setScenario = useCallback((value: string) => {
    setScenarioState(value.trim() || (scenarios[0] ?? runSeedDefaults.scenario));
  }, [scenarios]);

  const setMode = useCallback((value: OrchestrationMode) => {
    setModeState(value);
  }, []);

  const setLane = useCallback((value: OrchestrationLane) => {
    setLaneState(value);
  }, []);

  const modeLabel = strategyModeLabels[mode];
  const laneLabel = strategyLaneLabels[lane];
  const fallbackRuns: IntelligenceServiceState['seedRuns'] = [];
  const seedRuns = serviceState?.seedRuns ?? fallbackRuns;

  const summary = useMemo(
    () => summarizeRuns(seedRuns),
    [seedRuns],
  );

  useEffect(() => {
    if (tenant && !serviceState && scenario) {
      void start();
    }
  }, [tenant, scenario, start, serviceState]);

  return {
    tenant,
    scenario,
    loading,
    mode,
    lane,
    seedHistory,
    timeline: serviceState?.timeline ?? [],
    eventCount: serviceState?.eventCount ?? 0,
    registryCount: serviceState?.registryCount ?? 0,
    registryRoute: serviceState?.registryRoute ?? '',
    planSummary: serviceState?.planSummary ?? '',
    outputScore: serviceState?.summary.outputScore ?? 0,
    laneLabel,
    modeLabel,
    runId: parseRunTarget(scenario),
    lastRuns: seedRuns,
    summary,
    start,
    setTenant,
    setScenario,
    setMode,
    setLane,
  };
};
