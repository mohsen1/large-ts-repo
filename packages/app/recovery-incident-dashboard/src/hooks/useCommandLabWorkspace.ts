import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecoveryCommand } from '@domain/incident-command-models';
import { CommandLabService } from '../services/commandLabService';
import type { CommandLabFilterMode, CommandLabPanelState, CommandLabWorkspace } from '../types/recoveryCommandLab';

interface UseCommandLabWorkspaceInput {
  readonly tenantId: string;
  readonly commands: readonly RecoveryCommand[];
}

export interface UseCommandLabWorkspaceOutput {
  readonly workspace: CommandLabWorkspace | null;
  readonly loading: boolean;
  readonly errorMessage: string | null;
  readonly filter: CommandLabFilterMode;
  readonly setFilter: (filter: CommandLabFilterMode) => void;
  readonly draftPlan: () => Promise<void>;
  readonly executePlan: () => Promise<void>;
  readonly panelState: CommandLabPanelState;
}

const buildPlanId = (tenantId: string): string => `plan:${tenantId}:${Date.now()}`;

const buildWindowedCommand = (command: RecoveryCommand): RecoveryCommand => command;

export const useCommandLabWorkspace = ({
  tenantId,
  commands,
}: UseCommandLabWorkspaceInput): UseCommandLabWorkspaceOutput => {
  const service = useRef(new CommandLabService(tenantId, `workspace-${tenantId}`));
  const [workspace, setWorkspace] = useState<CommandLabWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommandLabFilterMode>('all');

  const panelState = service.current.getPanelState();
  const normalizedCommands = useMemo(() => {
    const ranked = [...commands].sort((left, right) => right.riskWeight - left.riskWeight);
    return ranked.map(buildWindowedCommand);
  }, [commands]);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await service.current.hydrate(normalizedCommands);
    if (!result.ok) {
      setErrorMessage(result.error.message);
      setLoading(false);
      return;
    }
    setWorkspace(result.value.workspace);
    setLoading(false);
  }, [normalizedCommands]);

  const draftPlan = useCallback(async () => {
    setLoading(true);
    const response = await service.current.draft({
      tenantId,
      requestedBy: 'react-host',
      commands: normalizedCommands,
      windowMinutes: 30,
    });
    if (!response.ok) {
      setErrorMessage(response.error.message);
      setLoading(false);
      return;
    }
    setWorkspace(response.value.workspace);
    setLoading(false);
  }, [tenantId, normalizedCommands]);

  const executePlan = useCallback(async () => {
    const planId = buildPlanId(tenantId);
    setLoading(true);
    const response = await service.current.execute(planId, normalizedCommands.slice(0, 2).map((command) => command.id));
    if (!response.ok) {
      setErrorMessage(response.error.message);
      setLoading(false);
      return;
    }
    setWorkspace(response.value.workspace);
    setLoading(false);
  }, [tenantId, normalizedCommands]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    workspace,
    loading,
    errorMessage,
    filter,
    setFilter,
    draftPlan,
    executePlan,
    panelState,
  };
};
