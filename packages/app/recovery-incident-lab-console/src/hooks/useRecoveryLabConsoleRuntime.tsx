import { useCallback, useMemo, useRef, useState } from 'react';
import {
  inspectRun,
  formatWindow,
  detectScope,
  normalizeScope,
  type RuntimeEventPayload,
  type RuntimeRunId,
  type RuntimeWorkspaceId,
  type RuntimeSessionId,
} from '@domain/recovery-lab-console-runtime';
import { executeLabRuntime, type RuntimeExecutionRequest } from '../services/recoveryLabRuntimeService';
import type { IncidentLabScenario, IncidentLabPlan } from '@domain/recovery-incident-lab-core';

interface State {
  readonly mode: 'ready' | 'running' | 'complete' | 'error';
  readonly error: string | null;
  readonly runText: string;
  readonly timeline: readonly string[];
  readonly metadata: Record<string, string>;
  readonly pluginCount: number;
  readonly summary: string;
}

interface RunSnapshot {
  readonly runId: RuntimeRunId;
  readonly workspaceId: RuntimeWorkspaceId;
  readonly sessionId: RuntimeSessionId;
  readonly pluginCount: number;
  readonly stageCount: number;
}

const scopeKeys = ['topology', 'signal', 'policy', 'command', 'telemetry', 'synthesis'] as const;

type ScopedHistory = {
  readonly scope: (typeof scopeKeys)[number];
  readonly timeline: readonly {
    readonly at: string;
    readonly value: number;
  }[];
};

const defaultState: State = {
  mode: 'ready',
  error: null,
  runText: 'not run yet',
  timeline: [],
  metadata: { mode: 'predictive', scope: 'topology' },
  pluginCount: 0,
  summary: 'no runs executed',
};

export const useRecoveryLabConsoleRuntime = () => {
  const [state, setState] = useState<State>(defaultState);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [history, setHistory] = useState<readonly ScopedHistory[]>([]);
  const lastRun = useRef<RuntimeExecutionRequest | null>(null);

  const launch = useCallback(async (scenario: IncidentLabScenario, plan: IncidentLabPlan, tenantId: string, workspace: string) => {
    const request: RuntimeExecutionRequest = {
      tenantId,
      workspace,
      scenario,
      plan,
    };
    lastRun.current = request;

    setState((current) => ({
      ...current,
      mode: 'running',
      error: null,
      runText: 'running runtime...',
    }));

    try {
      const output = await executeLabRuntime(request);
      const events = [
        {
          at: new Date().toISOString(),
          channel: `run:${String(output.runId)}:topology:runtime.finished` as RuntimeEventPayload['channel'],
          payload: {
            summary: output.report.summary,
            pluginCount: output.diagnostics.pluginCount,
            mode: output.report.mode,
            scope: output.report.summary,
          },
        },
      ] satisfies readonly RuntimeEventPayload[];

      const runId = output.runId;
      const inspected = inspectRun(runId, events);

      const windowSummary = formatWindow(inspected);
      const scopes = detectScope([
        {
          at: new Date().toISOString(),
          channel: `run:${String(output.runId)}:topology:plugin.completed` as RuntimeEventPayload['channel'],
          payload: { summary: output.runId, scope: normalizeScope('topology'), mode: output.report.mode },
        },
      ]);

      const scopedHistory: ScopedHistory[] = scopeKeys.map((scope) => ({
        scope,
        timeline: inspected.trend
          .filter((_point, index) => index % 2 === 0)
          .map((point) => ({
            at: point.at,
            value: point.value,
          })),
      }));

      setHistory(scopedHistory.toSorted((left, right) => left.scope.localeCompare(right.scope)));
      setSnapshot({
        runId,
        workspaceId: output.workspaceId,
        sessionId: output.sessionId,
        pluginCount: output.diagnostics.pluginCount,
        stageCount: output.diagnostics.stageCount,
      });
      setState((current) => ({
        ...current,
        mode: 'complete',
        runText: `run ${output.runId}`,
        timeline: inspected.labels,
        metadata: {
          mode: output.report.mode,
          scope: scopes.join(',') || 'topology',
          windowStart: windowSummary.from,
          windowEnd: windowSummary.to,
          pluginCount: String(output.diagnostics.pluginCount),
        },
        pluginCount: output.diagnostics.pluginCount,
        summary: output.report.summary,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        mode: 'error',
        error: error instanceof Error ? error.message : 'runtime failed',
        runText: 'runtime aborted',
      }));
      setSnapshot(null);
    }
  }, []);

  const restart = useCallback(() => {
    const run = lastRun.current;
    if (!run) {
      return Promise.resolve(undefined);
    }
    return launch(run.scenario, run.plan, run.tenantId, run.workspace);
  }, [launch]);

  const timeline = useMemo(
    () => history.flatMap((entry) => entry.timeline.map((item) => `${entry.scope}: ${item.at}:${item.value}`)),
    [history],
  );

  const status = useMemo(() => {
    if (state.mode === 'running') {
      return `runtime in progress using ${state.pluginCount} plugins`;
    }
    if (state.mode === 'complete') {
      return `runtime complete: ${snapshot ? `${snapshot.runId} (${snapshot.workspaceId})` : 'no snapshot'}`;
    }
    if (state.mode === 'error') {
      return `runtime failed: ${state.error ?? 'unknown'}`;
    }
    return 'runtime ready';
  }, [snapshot, state.error, state.mode, state.pluginCount]);

  return {
    state,
    snapshot,
    history,
    timeline,
    status,
    launch,
    restart,
    canRestart: lastRun.current !== null,
  };
};
