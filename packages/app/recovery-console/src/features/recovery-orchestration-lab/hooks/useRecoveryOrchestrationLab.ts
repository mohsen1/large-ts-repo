import { useCallback, useEffect, useMemo, useState } from 'react';
import { type TenantId } from '../domain/models';
import { createEngine } from '../services/orchestration-engine';
import { buildDemoPlan, executePlan, type ExecutionSummary } from '../services/orchestration-api';
import { asTuple } from '../domain/tuple-utils';
import { bootstrapPlugins } from '../runtime/plugin-loader';
import { inferExecutionOrder } from '../runtime/plugin-types';
import type { PluginName } from '../runtime/plugin-types';
import { useMemo as asMemo } from 'react';

export interface LabState {
  readonly tenant: TenantId;
  readonly title: string;
  readonly status: 'idle' | 'running' | 'success' | 'error';
  readonly summary: ExecutionSummary | null;
  readonly error: string | null;
  readonly lastRanAt: string;
  readonly pluginOrder: readonly PluginName[];
}

export const useRecoveryOrchestrationLab = (tenant: TenantId, title: string) => {
  const defaultOrder = useMemo(() => inferExecutionOrder(bootstrapPlugins.registry), [bootstrapPlugins.registry]);
  const [status, setStatus] = useState<LabState['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExecutionSummary | null>(null);
  const [pluginOrder, setPluginOrder] = useState(defaultOrder);

  useEffect(() => {
    setPluginOrder(defaultOrder);
    setSummary((previous) => (previous === null ? null : previous));
  }, [defaultOrder]);

  const run = useCallback(async (): Promise<void> => {
    setStatus('running');
    setError(null);
    try {
      const next = await executePlan(createEngine(tenant), tenant, title);
      setSummary(next);
      setPluginOrder((existing) => [...existing]);
      setStatus('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unknown execution error');
      setStatus('error');
    }
  }, [tenant, title]);

  const reset = useCallback(() => {
    const prepared = buildDemoPlan(tenant, title);
    setSummary({
      runId: prepared.runId,
      directiveCount: 0,
      directives: [],
      timeline: [],
      elapsedMs: 0,
    });
    setStatus('idle');
    setError(null);
  }, [tenant, title]);

  const diagnostics = asMemo(
    () => ({
      selectedRunId: summary?.runId ?? `candidate:${tenant}`,
      directiveCount: summary?.directiveCount ?? 0,
      timelineLength: summary?.timeline.length ?? 0,
    }),
    [summary, tenant],
  );

  return {
    state: {
      tenant,
      title,
      status,
      summary,
      error,
      lastRanAt: new Date().toISOString(),
      pluginOrder,
    },
    run,
    reset,
    diagnostics,
  };
};
