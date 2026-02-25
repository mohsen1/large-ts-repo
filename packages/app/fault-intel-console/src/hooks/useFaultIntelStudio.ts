import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CampaignTemplateRequest,
  CampaignTemplateOptions,
  createCampaignPlan,
  type CampaignRunResult,
  type IncidentSignal,
  type TenantId,
  type WorkspaceId,
} from '@domain/fault-intel-orchestration';
import { readCampaignSummary } from '@data/fault-intel-store';
import { CampaignExecutor } from '@service/fault-intel-orchestrator';

type StudioMode = 'idle' | 'running' | 'complete' | 'error';

export interface UseFaultIntelStudioOptions {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}

export interface UseFaultIntelStudioState {
  readonly mode: StudioMode;
  readonly selectedPhases: readonly string[];
  readonly planSignature: string | undefined;
  readonly signalCount: number;
  readonly error: string | undefined;
  readonly run: CampaignRunResult | undefined;
  readonly topSignals: readonly IncidentSignal[];
}

const defaultRequest = (tenantId: TenantId, workspaceId: WorkspaceId): CampaignTemplateRequest<readonly ['intake', 'triage', 'remediation', 'recovery']> => ({
  tenantId,
  workspaceId,
  owner: 'studio-user',
  campaignSeed: 'studio-template',
  phases: ['intake', 'triage', 'remediation', 'recovery'],
});

const defaultOptions: CampaignTemplateOptions = {
  enforcePolicy: true,
  maxSignals: 120,
  includeAllSignals: true,
};

export const useFaultIntelStudio = ({ tenantId, workspaceId }: UseFaultIntelStudioOptions) => {
  const [mode, setMode] = useState<StudioMode>('idle');
  const [phaseSelection, setPhaseSelection] = useState<readonly string[]>(['intake', 'triage', 'recovery']);
  const [signals, setSignals] = useState<number>(0);
  const [run, setRun] = useState<CampaignRunResult>();
  const [planSignature, setPlanSignature] = useState<string>();
  const [error, setError] = useState<string>();

  const executor = useMemo(() => new CampaignExecutor(), []);

  useEffect(() => {
    let disposed = false;
    void readCampaignSummary(tenantId as string, workspaceId as string)
      .then((summary) => {
        if (!disposed) {
          setSignals(summary.summary.uniqueSignals);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError('Summary unavailable');
        }
      });
    return () => {
      disposed = true;
    };
  }, [tenantId, workspaceId]);

  const runCampaign = useCallback(async () => {
    setMode('running');
    setError(undefined);
    try {
      const request = defaultRequest(tenantId, workspaceId);
      const plan = createCampaignPlan(request, [] as readonly IncidentSignal[], defaultOptions);
      setPlanSignature(plan.activeRoute);
      setSignals(plan.orderedSignals.length);
      setRun(undefined);

      const result = await executor.execute({
        tenantId,
        workspaceId,
        campaignId: `campaign::${Date.now()}` as never,
        phases: ['intake', 'triage', 'remediation', 'recovery'],
        request,
      });

      if (!result.ok) {
        setMode('error');
        setError(result.error.message);
        return;
      }

      setMode('complete');
      setRun(result.value.run);
      setSignals(result.value.run.signals.length);
      setPlanSignature(result.value.run.planId);
    } catch (runError) {
      setMode('error');
      setError(runError instanceof Error ? runError.message : 'Execution failed');
    }
  }, [tenantId, workspaceId, executor]);

  const togglePhase = useCallback((phase: string) => {
    const next = phaseSelection.includes(phase)
      ? phaseSelection.filter((entry) => entry !== phase)
      : [...phaseSelection, phase];
    setPhaseSelection(next.length === 0 ? ['intake', 'triage', 'recovery'] : next);
  }, [phaseSelection]);

  return {
    state: {
      mode,
      selectedPhases: phaseSelection,
      planSignature,
      signalCount: signals,
      error,
      run,
      topSignals: run?.signals ?? [],
    } as const,
    runCampaign,
    togglePhase,
  };
};
