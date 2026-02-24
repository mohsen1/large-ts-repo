import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AutomationTenantId } from '@domain/recovery-automation-orchestrator';
import { createOrchestrator, executePlan, evaluateCommandBatch, loadTelemetry } from '../services/automationOrchestratorService';
import type { UseRecoveryAutomationOrchestratorResult } from '../types';
import {
  type AutomationDashboardCommand,
  type AutomationTelemetryDatum,
  type AutomationViewModel,
} from '../types';

const DEFAULT_TENANT = 'tenant:global' as AutomationTenantId;
const DEFAULT_PLAN = 'plan:incident-lifecycle:v2.0';

const buildDefaultViewModel = (tenant: AutomationTenantId, planId: string): AutomationViewModel => ({
  tenant,
  status: 'queued',
  planId,
  commands: [
    {
      id: 'command:queue',
      title: 'Queue command',
      stage: 'stage:intake',
      enabled: true,
      priority: 'high',
      tenant,
    },
  ],
  metrics: [],
  config: {
    tenant,
    timeoutMs: 30_000,
    includeTelemetry: true,
    dryRun: false,
    concurrency: 2,
  },
});

export const useRecoveryAutomationOrchestrator = (): UseRecoveryAutomationOrchestratorResult => {
  const [tenant, setTenant] = useState<AutomationTenantId>(DEFAULT_TENANT);
  const [planId, setPlanId] = useState<string>(DEFAULT_PLAN);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [run, setRun] = useState<UseRecoveryAutomationOrchestratorResult['run']>(undefined);
  const [summary, setSummary] = useState<UseRecoveryAutomationOrchestratorResult['viewModel']['summary']>(undefined);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [commands, setCommands] = useState<readonly AutomationDashboardCommand[]>([]);
  const [telemetry, setTelemetry] = useState<readonly AutomationTelemetryDatum[]>([]);

  const refresh = useCallback(() => {
    const orchestrator = createOrchestrator(tenant);
    setRun(undefined);
    setErrorMessage('');
    setSummary(undefined);
    orchestrator.getState();
    setCommands(buildDefaultViewModel(tenant, planId).commands);
  }, [tenant, planId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setCommands(buildDefaultViewModel(tenant, planId).commands);
        const series = await loadTelemetry(planId, tenant);
        if (!active) {
          return;
        }
        setTelemetry(series);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage((error as Error).message);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [planId, tenant]);

  const execute = useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');
    try {
      const result = await executePlan(tenant, planId);
      setSummary(result.summary);
      setRun(result.summary?.run);
      setTelemetry((previous) => [
        ...previous,
        {
          metric: `command:${planId}`,
          value: result.summary?.riskScore ?? 0,
          at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      setErrorMessage((error as Error).message);
      setSummary(undefined);
      setRun(undefined);
    } finally {
      setIsBusy(false);
    }
  }, [planId, tenant]);

  const viewModel: AutomationViewModel = useMemo(() => {
    const batch = evaluateCommandBatch(commands);
    return {
      tenant,
      planId,
      status: summary ? summary.run.status : 'queued',
      commands: commands.length > 0 ? commands : buildDefaultViewModel(tenant, planId).commands,
      metrics: telemetry,
      summary,
      config: {
        tenant,
        timeoutMs: 30_000,
        includeTelemetry: true,
        dryRun: false,
        concurrency: Math.min(4, Math.max(1, batch.blockedCount + 1)) as 1 | 2 | 3 | 4 | 8,
      },
    };
  }, [commands, planId, summary, tenant, telemetry]);

  return {
    run,
    viewModel,
    isBusy,
    execute,
    refresh,
    setTenant,
    setPlanId,
    errorMessage,
  } satisfies UseRecoveryAutomationOrchestratorResult;
};
