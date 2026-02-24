import { useEffect, useMemo } from 'react';
import { ExecutionEnvelope } from '../services/advancedCockpitOrchestrationService';
import { OrchestratorPhase } from '@shared/ops-orchestration-runtime';
import { useAdvancedCockpitOrchestration } from './useAdvancedCockpitOrchestration';

interface DiagnosticsSignal {
  readonly phase: OrchestratorPhase;
  readonly status: 'pass' | 'warn' | 'fail';
  readonly label: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface OrchestrationDiagnostics {
  readonly signals: ReadonlyArray<DiagnosticsSignal>;
  readonly timeline: readonly string[];
  readonly anomalies: readonly string[];
}

const deriveStatus = (entry: ExecutionEnvelope): DiagnosticsSignal['status'] => (entry.ok ? 'pass' : 'warn');

const toSignal = (entry: ExecutionEnvelope, index: number): DiagnosticsSignal => ({
  phase: entry.phase as OrchestratorPhase,
  status: deriveStatus(entry),
  label: `${index + 1}.${entry.phaseLabel}`,
  details: {
    score: entry.score,
    message: entry.detail,
    namespace: entry.namespace,
  },
});

export function useAdvancedOrchestrationDiagnostics({
  workspaceId,
  plans,
  autoStart,
}: {
  workspaceId: string;
  plans: ReadonlyArray<{ planId: string }>;
  autoStart: boolean;
}): OrchestrationDiagnostics & {
  health: string;
  healthLabel: string;
  metrics: { namespace: string; pluginCount: number; phases: readonly string[]; score: number; allowed: boolean } | null;
  seededPlugins: ReturnType<typeof useAdvancedCockpitOrchestration>['seededPlugins'];
  artifactSummary: string;
  runOrchestration: () => Promise<void>;
  reset: () => void;
} {
  const state = useAdvancedCockpitOrchestration({
    workspaceId,
    plans: plans as never,
    autoStart,
  });

  const signals = useMemo(
    () => state.snapshots.map(toSignal),
    [state.snapshots],
  );

  const anomalies = useMemo(
    () =>
      signals
        .map((signal, index) => ({ signal, index }))
        .filter(({ signal }) => signal.status === 'warn')
        .map(({ signal, index }) => `${index + 1}:${signal.label}:WARN`),
    [signals],
  );

  const timeline = useMemo(() => signals.map((entry) => `${entry.label}:${entry.status}`), [signals]);

  useEffect(() => {
    const invalid = signals.filter((signal) => signal.status === 'warn');
    void invalid;
  }, [signals]);

  const healthLabel = state.health === 'ready' ? 'green' : state.health === 'failed' ? 'red' : 'yellow';

  return {
    signals,
    timeline,
    anomalies,
    health: state.health,
    healthLabel,
    metrics: state.metrics
      ? {
          namespace: state.metrics.namespace,
          pluginCount: state.metrics.pluginCount,
          phases: state.metrics.phases,
          score: state.metrics.score,
          allowed: state.metrics.allowed,
        }
      : null,
    seededPlugins: state.seededPlugins,
    artifactSummary: state.artifactSummary,
    runOrchestration: state.runOrchestration,
    reset: state.reset,
  };
}
