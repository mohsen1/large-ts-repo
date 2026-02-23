import { useEffect, useMemo, useState } from 'react';
import { buildDraftInsights, makeDraft, type HubDraft, type HubExecution, type HubDraftInput, type HubRunId } from '@domain/recovery-command-control-hub';
import { CommandControlHubOrchestrator, InMemoryCommandHubRepository, ConsoleRuntimePublisher } from '@service/recovery-command-control-hub';
import type { ControlHubCommandDraft, ControlHubPageState, ControlHubFilter } from '../types';

const commandSeed: readonly ControlHubCommandDraft[] = [
  {
    commandName: 'Drain region-west node',
    component: 'search-service',
    ownerTeam: 'infra',
    impactBand: 'high',
    estimatedDurationMs: 300000,
  },
  {
    commandName: 'Verify data replica',
    component: 'db-ops',
    ownerTeam: 'platform',
    impactBand: 'critical',
    estimatedDurationMs: 600000,
  },
  {
    commandName: 'Rebalance queue leaders',
    component: 'streaming',
    ownerTeam: 'platform',
    impactBand: 'medium',
    estimatedDurationMs: 420000,
  },
];

const orchestrator = new CommandControlHubOrchestrator(new InMemoryCommandHubRepository(), new ConsoleRuntimePublisher());

const defaultState = (tenant: string): ControlHubPageState => ({
  tenant,
  runId: 'run-pending' as HubRunId,
  filter: { tenant },
  draftedCount: 0,
  inFlight: false,
  notes: [],
});

const asDraftInput = (tenant: string, draft: ControlHubCommandDraft): HubDraftInput => ({
  tenantId: tenant,
  commandName: draft.commandName,
  component: draft.component,
  ownerTeam: draft.ownerTeam,
  impactBand: draft.impactBand,
  estimatedDurationMs: draft.estimatedDurationMs,
});

export const useRecoveryCommandControlHub = (tenant: string): {
  readonly state: ControlHubPageState;
  readonly draftSummary: HubDraft;
  readonly draftInsights: ReturnType<typeof buildDraftInsights>;
  readonly startHub: () => Promise<void>;
  readonly setFilter: (filter: ControlHubFilter) => void;
  readonly resetDraft: () => void;
} => {
  const [state, setState] = useState<ControlHubPageState>(defaultState(tenant));
  const [commands, setCommands] = useState<readonly ControlHubCommandDraft[]>(commandSeed);
  const [execution, setExecution] = useState<HubExecution | undefined>(undefined);

  useEffect(() => {
    setState((current) => ({ ...current, tenant, filter: { ...current.filter, tenant } }));
  }, [tenant]);

  const preparedCommands = useMemo(() => commands.map((draft) => asDraftInput(tenant, draft)), [commands, tenant]);
  const plan = useMemo(() => makeDraft({ tenantId: tenant, nodes: preparedCommands }), [tenant, preparedCommands]);
  const draftSummary = plan.draft;
  const draftInsights = buildDraftInsights(plan.summary);

  const startHub = async (): Promise<void> => {
    setState((current) => ({ ...current, inFlight: true }));
    const result = await orchestrator.start({
      tenantId: tenant,
      commands: preparedCommands,
    });

    if (!result.ok) {
      setState((current) => ({
        ...current,
        inFlight: false,
        notes: [...current.notes, `orchestrator failed: ${result.error.message}`],
      }));
      return;
    }

    setExecution(result.value.execution);
    setState((current) => ({
      ...current,
      runId: result.value.runId,
      inFlight: false,
      draftedCount: plan.order.length,
      notes: [...current.notes, ...result.value.recommendations],
    }));
  };

  const setFilter = (filter: ControlHubFilter): void => {
    setState((current) => ({
      ...current,
      filter: {
        ...current.filter,
        ...filter,
      },
    }));
  };

  const resetDraft = (): void => {
    setCommands(commandSeed);
    setExecution(undefined);
    setState((current) => ({
      ...current,
      draftedCount: 0,
      notes: ['draft reset'],
    }));
  };

  return {
    state: {
      ...state,
      draftedCount: plan.order.length,
      execution,
      notes: state.filter.minRiskScore && draftSummary.summary.totalDurationMs < state.filter.minRiskScore
        ? ['risk estimate below threshold']
        : draftSummary.summary.totalDurationMs >= (state.filter.minRiskScore ?? 0)
          ? ['risk estimate ready']
          : ['risk estimate in progress'],
    },
    draftSummary,
    draftInsights,
    startHub,
    setFilter,
    resetDraft,
  };
};
