import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LabMode } from '@domain/recovery-lab-stress-lab-core';
import { buildLabTemplate, runChaosLabPlan } from '../services/lab-orchestration-service';

export interface ChaosLabDashboardParams {
  readonly tenant: string;
  readonly mode: LabMode;
  readonly autoRefresh?: boolean;
  readonly refreshMs?: number;
}

export interface ChaosLabDashboardState {
  readonly title: string;
  readonly directiveCount: number;
  readonly artifactCount: number;
  readonly timeline: readonly string[];
  readonly summary: string;
  readonly isRunning: boolean;
  readonly latestSummary: string;
  readonly error?: string;
}

const emptyResult: ChaosLabDashboardState = {
  title: 'idle',
  directiveCount: 0,
  artifactCount: 0,
  timeline: [] as readonly string[],
  summary: 'not-started',
  isRunning: false,
  latestSummary: 'never',
};

const buildRefreshMs = (input: number | undefined): number => {
  if (!input || Number.isNaN(input)) {
    return 15000;
  }
  return Math.max(1000, Math.min(120000, input));
};

export const useChaosLabDashboard = (params: ChaosLabDashboardParams): ChaosLabDashboardState & {
  readonly templateLabel: string;
  readonly runPlan: () => Promise<void>;
} => {
  const [state, setState] = useState<ChaosLabDashboardState>(emptyResult);
  const [isRunning, setRunning] = useState(false);
  const [latestSummary, setLatestSummary] = useState('never');
  const [error, setError] = useState<string | undefined>(undefined);

  const template = buildLabTemplate({ tenant: params.tenant, mode: params.mode });
  const templateLabel = `${template.tenant}:${template.mode}`;
  const refreshMs = buildRefreshMs(params.refreshMs);

  const runPlan = useCallback(async (): Promise<void> => {
    setRunning(true);
    setError(undefined);
    try {
      const result = await runChaosLabPlan(params.tenant, params.mode);
      setState((current) => ({
        ...current,
        title: result.title,
        directiveCount: result.directiveCount,
        artifactCount: result.artifactCount,
        timeline: result.timeline,
        summary: result.summary,
      }));
      setLatestSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown failure');
    } finally {
      setRunning(false);
    }
  }, [params.mode, params.tenant]);

  const summary = useMemo(() => {
    if (!state.timeline.length) {
      return `tenant=${params.tenant} mode=${params.mode} status=${isRunning ? 'running' : 'idle'}`;
    }
    const latestStep = state.timeline[state.timeline.length - 1];
    return `${latestSummary} | tenant=${params.tenant} | last=${latestStep}`;
  }, [isRunning, latestSummary, params.mode, params.tenant, state.timeline]);

  useEffect(() => {
    if (!params.autoRefresh) {
      return;
    }

    void runPlan();
    const timer = setInterval(() => {
      void runPlan();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [params.autoRefresh, refreshMs, runPlan]);

  return {
    title: state.title,
    directiveCount: state.directiveCount,
    artifactCount: state.artifactCount,
    timeline: state.timeline,
    summary,
    isRunning,
    latestSummary,
    templateLabel,
    runPlan,
    error,
  };
};
