import { useCallback, useMemo, useState } from 'react';
import { buildIncidentCommandHubManager } from '@service/recovery-operations-engine/incident-command-hub';
import { buildRecoveryCommandOrchestrator } from '@service/recovery-operations-engine/command-hub-orchestrator';
import type { CadenceSnapshot } from '@domain/recovery-operations-models/control-plane-cadence';
import type { IncidentCommandHubError } from '@service/recovery-operations-engine/incident-command-hub';

interface UseRecoveryCommandCadenceState {
  readonly tenant: string;
  readonly cadenceIssues: readonly CadenceSnapshot[];
  readonly escalationActions: readonly string[];
  readonly loading: boolean;
  readonly error?: string;
}

const toErrorMessage = (error: IncidentCommandHubError): string => error?.message ?? `command cadence error (${error?.reason})`;

export const useRecoveryCommandCadence = () => {
  const [tenant, setTenant] = useState('global');
  const [cadenceIssues, setCadenceIssues] = useState<readonly CadenceSnapshot[]>([]);
  const [escalationActions, setEscalationActions] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const commandService = useMemo(() => buildIncidentCommandHubManager(), []);
  const orchestrator = useMemo(() => buildRecoveryCommandOrchestrator(), []);

  const loadCadence = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await commandService.inspectCadence(tenant);
      if (!result.ok) {
        setError(toErrorMessage(result.error));
        setCadenceIssues([]);
        return;
      }
      setCadenceIssues(result.value);
    } finally {
      setLoading(false);
    }
  }, [commandService, tenant]);

  const escalate = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const commands = cadenceIssues.map((issue) => issue.commandId);
      const actions = await Promise.all(
        commands.map(async (commandId) => {
          const result = await orchestrator.escalateCommand(tenant, commandId);
          if (!result.ok) {
            return `command=${commandId} failed=${result.error}`;
          }
          return `${commandId}: ${result.value.join(' ')}`;
        }),
      );
      setEscalationActions(actions);
    } finally {
      setLoading(false);
    }
  }, [tenant, cadenceIssues, orchestrator]);

  const refresh = useCallback(async () => {
    await loadCadence();
  }, [loadCadence]);

  const state: UseRecoveryCommandCadenceState = {
    tenant,
    cadenceIssues,
    escalationActions,
    loading,
    error,
  };

  return {
    state,
    setTenant,
    refresh,
    escalate,
    loadCadence,
  };
};
