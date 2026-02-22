import { useCallback, useMemo, useState } from 'react';
import { buildIncidentCommandHubManager, type IncidentCommandHubInputs } from '@service/recovery-operations-engine/incident-command-hub';
import type { CommandHubSummary } from '@data/recovery-operations-store/command-hub-facade';
import type { CommandWindowPrediction } from '@domain/recovery-operations-models/command-window-forecast';
import type { IncidentCommandHubError } from '@service/recovery-operations-engine/incident-command-hub';

interface UseRecoveryCommandHubState {
  readonly tenant: string;
  readonly commandId: string;
  readonly error?: string;
  readonly loading: boolean;
  readonly predictions: readonly CommandWindowPrediction[];
  readonly summary?: CommandHubSummary;
  readonly isBusy: boolean;
}

const toErrorMessage = (error: IncidentCommandHubError): string => error?.message ?? `operation failed (${error?.reason})`;

export const useRecoveryCommandHub = () => {
  const [tenant, setTenant] = useState('global');
  const [commandId, setCommandId] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<readonly CommandWindowPrediction[]>([]);
  const [summary, setSummary] = useState<CommandHubSummary | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);

  const service = useMemo(() => buildIncidentCommandHubManager(), []);

  const refreshSummary = useCallback(async () => {
    const result = await service.summarize(tenant);
    if (!result.ok) {
      setError(toErrorMessage(result.error));
      return;
    }
    setSummary(result.value);
  }, [service, tenant]);

  const registerCommand = useCallback(async (input: IncidentCommandHubInputs) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await service.registerSeed(input);
      if (!result.ok) {
        setError(toErrorMessage(result.error));
        return;
      }
      setCommandId(String(result.value.artifact.commandId));
    } finally {
      setLoading(false);
    }
  }, [service]);

  const forecast = useCallback(async (nextCommandId: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await service.computeForecast(nextCommandId);
      if (!result.ok) {
        setError(toErrorMessage(result.error));
        return;
      }
      setPredictions((existing) => [...existing, result.value]);
    } finally {
      setLoading(false);
    }
  }, [service]);

  const executeCommand = useCallback(async () => {
    setIsBusy(true);
    setError(undefined);
    try {
      const result = await service.executeCommand(commandId);
      if (!result.ok) {
        setError(toErrorMessage(result.error));
        return;
      }
      await refreshSummary();
    } finally {
      setIsBusy(false);
    }
  }, [service, commandId, refreshSummary]);

  const runPipeline = useCallback(async (seed: IncidentCommandHubInputs) => {
    await registerCommand(seed);
    const id = seed.commandSeed.commandId;
    if (id) {
      await forecast(id);
      await service.buildCadence(seed.tenant, id, 4);
      await executeCommand();
    }
  }, [registerCommand, forecast, service, executeCommand]);

  const state: UseRecoveryCommandHubState = {
    tenant,
    commandId,
    error,
    loading,
    predictions,
    summary,
    isBusy,
  };

  return {
    state,
    setTenant,
    setCommandId,
    registerCommand,
    forecast,
    executeCommand,
    refreshSummary,
    runPipeline,
  };
};
