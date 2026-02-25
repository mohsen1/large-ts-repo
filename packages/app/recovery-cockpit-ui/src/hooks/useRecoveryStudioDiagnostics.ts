import { useMemo } from 'react';
import type { StudioRunState } from '@service/recovery-orchestration-studio-engine';

export type DiagnosticsInput = {
  readonly runs: readonly StudioRunState[];
};

export type DiagnosticsOutput = {
  readonly totalRuns: number;
  readonly latestStatus: 'queued' | 'running' | 'finished' | 'error';
  readonly averageTickCount: number;
  readonly pluginHitCount: number;
  readonly uniquePlugins: readonly string[];
  readonly trend: readonly { readonly label: string; readonly value: number }[];
};

export const useRecoveryStudioDiagnostics = ({ runs }: DiagnosticsInput): DiagnosticsOutput => {
  const diagnostics = useMemo(() => {
    if (runs.length === 0) {
      return {
        totalRuns: 0,
        latestStatus: 'queued' as const,
        averageTickCount: 0,
        pluginHitCount: 0,
        uniquePlugins: [] as const,
        trend: [] as const,
      };
    }

    const latest = runs[runs.length - 1];
    const pluginSet = new Set<string>();
    let totalTicks = 0;

    for (const run of runs) {
      for (const tick of run.ticks) {
        pluginSet.add(tick.pluginId);
      }
      totalTicks += run.ticks.length;
    }

    const trend = runs
      .map((run, index) => ({
        label: `run-${index}`,
        value: run.ticks.length,
      }))
      .toSorted((left, right) => right.value - left.value);

    const statusMap: Record<string, DiagnosticsOutput['latestStatus']> = {
      running: 'running',
      finished: 'finished',
      blocked: 'error',
      failed: 'error',
      idle: 'queued',
    };

    return {
      totalRuns: runs.length,
      latestStatus: statusMap[latest.status] ?? 'queued',
      averageTickCount: totalTicks / runs.length,
      pluginHitCount: pluginSet.size,
      uniquePlugins: [...pluginSet],
      trend,
    };
  }, [runs]);

  return diagnostics;
};
