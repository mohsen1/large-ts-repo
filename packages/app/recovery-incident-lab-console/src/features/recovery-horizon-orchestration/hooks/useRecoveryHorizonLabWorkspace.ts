import { useCallback, useMemo, useState } from 'react';
import type { RunWindowConfig, OrchestrationSummary, OrchestrationPlan, WindowTrend } from '../types';
import { HorizonLabPipelineService, useHorizonLabPipeline } from '../services/horizonLabPipelineService';
import type { MeshExecution } from '@service/recovery-horizon-orchestrator/horizon-mesh.js';

export interface UseRecoveryHorizonLabWorkspace {
  readonly tenantId: string;
  readonly plan: OrchestrationPlan;
  readonly summary: OrchestrationSummary;
  readonly ready: boolean;
  readonly trend: readonly WindowTrend[];
  readonly records: number;
  readonly planLabel: string;
  readonly setPlanLabel: (value: string) => void;
  readonly history: readonly MeshExecution[];
  readonly run: () => Promise<{ ok: boolean; runId?: string; history?: readonly MeshExecution[] }>;
  readonly refresh: () => Promise<{ readOk: boolean; total: number }>;
  readonly copy: (value: string) => Promise<void>;
  readonly service: HorizonLabPipelineService;
}

const defaultConfig = (tenantId: string, owner = 'recovery-horizon-ui'): RunWindowConfig => ({
  tenantId,
  stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  owner,
  mode: 'live',
});

export const useRecoveryHorizonLabWorkspace = (tenantId = 'tenant-001', owner = 'recovery-horizon-ui'): UseRecoveryHorizonLabWorkspace => {
  const [planLabel, setPlanLabel] = useState('default-plan');
  const [clipboard, setClipboard] = useState<string>('');
  const hook = useHorizonLabPipeline(tenantId, owner);

  const plan = useMemo(() => hook.service.buildPlan(planLabel), [planLabel, hook.service]);
  const summary = hook.summary;

  const copy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
    setClipboard(value);
  }, []);

  const refresh = useCallback(async () => {
    const load = await hook.reload();
    return {
      readOk: load.ok,
      total: load.ok ? load.read.total : 0,
    };
  }, [hook]);

  const run = useCallback(async () => {
    const result = await hook.execute();
    if (hook.records.length === 0) {
      return { ok: false, runId: undefined, history: [] };
    }

    return {
      ok: result !== undefined,
      runId: hook.service.buildPlan(planLabel).id,
      history: result.history,
    };
  }, [hook, planLabel]);

  return {
    tenantId,
    plan,
    summary,
    ready: hook.ready,
    trend: hook.trend,
    records: hook.records.length,
    planLabel,
    setPlanLabel,
    history: hook.history,
    run,
    refresh,
    copy,
    service: hook.service,
  };
};

export { useHorizonLabPipeline };
