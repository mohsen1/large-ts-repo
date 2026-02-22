import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RecoveryIncidentCommandOrchestrator,
  type OrchestrationCommandInput,
  type PlanDraft,
  type ExecutionInput,
  type ExecutionStatus,
} from '@service/recovery-incident-command-orchestrator';
import { asRecoveryCommand, type RecoveryCommand } from '@domain/incident-command-models';

export interface CommandWorkspaceFilter {
  tenantId: string;
  windowMinutes: number;
  includeBlocked: boolean;
  autoSimulate: boolean;
}

interface CommandWorkspaceState {
  filter: CommandWorkspaceFilter;
  loading: boolean;
  draft: PlanDraft | null;
  execution: ExecutionStatus | null;
  logs: readonly string[];
  lastError: string | null;
  simulationLines: readonly string[];
  commandCount: number;
  topCandidates: readonly {
    id: string;
    risk: number;
    blocked: number;
  }[];
}

const defaultFilter: CommandWorkspaceFilter = {
  tenantId: 'tenant-a',
  windowMinutes: 45,
  includeBlocked: true,
  autoSimulate: true,
};

const makeCommand = (index: number): RecoveryCommand => {
  return asRecoveryCommand({
    id: `command-${index}` as never,
    title: `Recovery action ${index}`,
    ownerTeam: index % 3 === 0 ? 'infra-sre' : 'platform-engineering',
    dependencies: index % 2 === 0 ? [] : [`command-${Math.max(0, index - 1)}` as never],
    window: {
      id: `window-${index}` as never,
      startsAt: new Date(Date.now() + index * 3 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + (index + 2) * 3 * 60_000).toISOString(),
      preferredClass: 'compute',
      maxConcurrent: 2 + (index % 5),
    },
    affectedResources: ['compute', 'network', 'storage'],
    prerequisites: ['change-freeze-acknowledged'],
    description: 'Stabilize the active control plane',
    priority: 'high',
    constraints: [
      {
        id: `constraint-${index}-a` as never,
        commandId: `command-${index}` as never,
        reason: 'Requires network stability and low p95',
        hard: index % 4 === 0,
        tags: ['network', 'stability', index.toString()],
      },
    ],
    expectedRunMinutes: 8 + (index % 4),
    riskWeight: Number(((index % 10) / 10).toFixed(2)),
  });
};

const seedCommands = [...Array.from({ length: 18 }).keys()].map(makeCommand);

const toInput = (state: CommandWorkspaceFilter, commands: readonly RecoveryCommand[]): OrchestrationCommandInput => ({
  tenantId: state.tenantId,
  requestedBy: 'adaptive-ops-console',
  commands,
  windowMinutes: state.windowMinutes,
  dryRun: true,
});

const randomTenant = () => `tenant-${Math.floor(Math.random() * 100) + 1}`;

export const useRecoveryCommandCenter = (initialFilter: CommandWorkspaceFilter = defaultFilter) => {
  const [filter, setFilter] = useState<CommandWorkspaceFilter>(initialFilter);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [execution, setExecution] = useState<ExecutionStatus | null>(null);
  const [logs, setLogs] = useState<readonly string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [simulationLines, setSimulationLines] = useState<readonly string[]>([]);
  const [topCandidates, setTopCandidates] = useState<CommandWorkspaceState['topCandidates']>([]);

  const candidateCommands = useMemo(
    () => seedCommands.filter((command) => filter.includeBlocked || command.priority !== 'low'),
    [filter.includeBlocked],
  );

  const commandCount = candidateCommands.length;

  const setTenant = useCallback((tenantId: string) => {
    setFilter((current) => ({ ...current, tenantId }));
  }, []);

  const setWindowMinutes = useCallback((minutes: number) => {
    const clampedMinutes = Math.min(240, Math.max(15, minutes));
    setFilter((current) => ({ ...current, windowMinutes: clampedMinutes }));
  }, []);

  const setIncludeBlocked = useCallback((includeBlocked: boolean) => {
    setFilter((current) => ({ ...current, includeBlocked }));
  }, []);

  const runDraft = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    const orchestrator = RecoveryIncidentCommandOrchestrator.create(filter.tenantId, 'ui-operator');

    try {
      const commands = filter.includeBlocked ? candidateCommands : candidateCommands.filter((command) => command.priority !== 'low');
      const result = await orchestrator.draft(toInput(filter, commands));
      if (result.ok) {
        const planDraft = result.value.draft;
        setDraft(planDraft);
        setTopCandidates(
          planDraft.candidates.slice(0, 7).map((candidate) => ({
            id: candidate.command.id,
            risk: candidate.score,
            blocked: candidate.blockedReasonCount,
          })),
        );
        setLogs((current) => [`draft:${filter.tenantId}`, ...current].slice(0, 20));

        if (filter.autoSimulate) {
          const simulation = await orchestrator.simulate({
            tenantId: filter.tenantId,
            commands,
            windowMinutes: filter.windowMinutes,
          });
          if (simulation.ok) {
            setSimulationLines((current) => [
              ...current,
              `sim=${simulation.value.createdAt} impact=${simulation.value.result.impacts.length} tenant=${filter.tenantId}`,
            ]);
          }
        }
      } else {
        setLastError(result.error.message);
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'command planning failed');
    } finally {
      setLoading(false);
    }
  }, [filter, candidateCommands]);

  const runExecute = useCallback(async (force = false) => {
    const orchestrator = RecoveryIncidentCommandOrchestrator.create(filter.tenantId, 'ui-operator');
    const commandIds = draft?.plan.steps.map((step) => step.commandId) ?? [];
    const payload: ExecutionInput = {
      planId: `${filter.tenantId}:${Date.now()}` as ExecutionInput['planId'],
      tenantId: filter.tenantId,
      commandIds,
      force,
    };

    try {
      const result = await orchestrator.execute(payload);
      if (result.ok) {
        setExecution(result.value);
        setLogs((current) => [`execute:${result.value.runId}`, ...current].slice(0, 20));
      } else {
        setLastError(result.error.message);
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'execution failed');
    }
  }, [draft, filter.tenantId]);

  const reset = useCallback(() => {
    setLogs([]);
    setLastError(null);
    setDraft(null);
    setExecution(null);
    setSimulationLines([]);
    setTopCandidates([]);
    setFilter((current) => ({
      ...current,
      tenantId: randomTenant(),
    }));
  }, []);

  useEffect(() => {
    void runDraft();
  }, []);

  return {
    state: {
      filter,
      loading,
      draft,
      execution,
      logs,
      lastError,
      simulationLines,
      commandCount,
      topCandidates,
    },
    setTenant,
    setWindowMinutes,
    setIncludeBlocked,
    runDraft,
    runExecute,
    reset,
  };
};
