import { useCallback, useEffect, useMemo, useState } from 'react';
import { createScope } from '@shared/orchestration-kernel';
import { runQuantumScenario, buildScenarioSteps } from '../services/quantumScenarioEngine';
import { mapSeedToWorkspace, buildWorkloadTimeline } from '../types';
import type {
  QuantumWorkspace,
  QuantumTelemetryPoint,
  QuantumPluginMetric,
  QuantumRunState,
  QuantumExecutionResult,
  QuantumTimelineEvent,
} from '../types';
import { summarizeAdapter, adaptTelemetryToRows, type QuantumAdapterSummary } from '../services/quantumAdapterLayer';
import type { WorkflowPhase } from '@shared/orchestration-kernel';

const PHASES = ['collect', 'plan', 'execute', 'verify', 'close'] as const;

interface WorkspaceSeed {
  readonly tenant: string;
  readonly runId: string;
  readonly scenario: string;
  readonly mode: 'live' | 'simulation' | 'dry-run' | 'postmortem';
  readonly phases: readonly WorkflowPhase[];
}

const defaultSeed = (tenant: string): WorkspaceSeed => ({
  tenant,
  runId: `${tenant}-run-${Date.now()}`,
  scenario: 'quantum-orchestration',
  mode: 'simulation',
  phases: PHASES,
});

export interface QuantumOrchestrationHookState {
  readonly workspace: QuantumWorkspace;
  readonly scenarioRun: QuantumExecutionResult | null;
  readonly runState: QuantumRunState;
  readonly timeline: readonly QuantumTimelineEvent[];
  readonly telemetry: readonly QuantumTelemetryPoint[];
  readonly metricsRows: readonly { readonly index: number; readonly event: string; readonly score: number }[];
  readonly pluginMetrics: readonly QuantumPluginMetric[];
  readonly result: QuantumExecutionResult | null;
  readonly runError: string | null;
  readonly startRun: () => Promise<void>;
}

const summaryFromRun = async (input: {
  workspace: QuantumWorkspace;
  result: QuantumExecutionResult;
  telemetry: readonly QuantumTelemetryPoint[];
  pluginMetrics: readonly QuantumPluginMetric[];
}): Promise<QuantumAdapterSummary> => {
  return summarizeAdapter(input.workspace, input.result, input.telemetry, input.pluginMetrics, {
    mode: 'smoothed',
    trim: 12,
  });
};

export const useRecoveryQuantumOrchestration = (seedOverride?: Partial<WorkspaceSeed>): QuantumOrchestrationHookState => {
  const seed = useMemo(
  () => ({
      ...defaultSeed('tenant-alpha'),
      ...seedOverride,
      runId: seedOverride?.runId ?? defaultSeed('tenant-alpha').runId,
      phases: PHASES,
    }),
    [seedOverride],
  );

  const workspace = useMemo(() => mapSeedToWorkspace(seed), [seed]);
  const [runState, setRunState] = useState<QuantumRunState>('idle');
  const [runError, setRunError] = useState<string | null>(null);
  const [scenarioRun, setScenarioRun] = useState<QuantumExecutionResult | null>(null);
  const [timeline, setTimeline] = useState<readonly QuantumTimelineEvent[]>(() => buildWorkloadTimeline(workspace));
  const [telemetry, setTelemetry] = useState<readonly QuantumTelemetryPoint[]>(() => []);
  const [metricsRows, setMetricsRows] = useState<readonly { readonly index: number; readonly event: string; readonly score: number }[]>([]);
  const [pluginMetrics, setPluginMetrics] = useState<readonly QuantumPluginMetric[]>([]);
  const [result, setResult] = useState<QuantumExecutionResult | null>(null);
  const [steps, setSteps] = useState<readonly { nodeId: string; command: string; expectedMs: number }[]>(() =>
    buildScenarioSteps(workspace),
  );

  useEffect(() => {
    setSteps(buildScenarioSteps(workspace));
  }, [workspace]);

  const startRun = useCallback(async () => {
    setRunState('bootstrapping');
    setRunError(null);
    setResult(null);

    await using scope = createScope();
    void scope;

    try {
      const run = await runQuantumScenario({
        workspace,
        mode: seed.mode === 'simulation' || seed.mode === 'dry-run' || seed.mode === 'postmortem' ? 'sim' : 'live',
        seedTrace: `${workspace.tenant}:${steps.length}`,
      });

      const summary = await summaryFromRun({
        workspace,
        result: run.result,
        telemetry: run.telemetry,
        pluginMetrics: run.pluginMetrics,
      });

      setTimeline((previous) => [...previous, ...buildWorkloadTimeline(workspace, { offset: previous.length })]);
      setTelemetry(run.telemetry);
      setMetricsRows(summaryByMode(summary, 'raw'));
      setPluginMetrics(run.pluginMetrics);
      setResult(run.result);
      setScenarioRun(run.result);
      setRunState(run.result.state);
    } catch (error) {
      setRunState('errored');
      setRunError(error instanceof Error ? error.message : String(error));
    }
  }, [workspace, seed.mode, steps.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (runState === 'running') {
        setTimeline((previous) => [...previous, ...buildWorkloadTimeline(workspace, { offset: previous.length })]);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [runState, workspace]);

  return {
    workspace,
    scenarioRun,
    runState,
    timeline,
    telemetry,
    metricsRows,
    pluginMetrics,
    result,
    runError,
    startRun,
  };
};

const summaryByMode = (summary: QuantumAdapterSummary, mode: 'raw' | 'smoothed' | 'compressed') => {
  const rows = adaptTelemetryToRows(mode, [], {
    trim: 25,
  });
  return rows;
};
