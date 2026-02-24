import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCadenceOrchestrator,
  type OrchestratorError,
  type OrchestrationOutcome,
} from '@service/recovery-fabric-cadence-orchestrator';
import type {
  CadenceCommand,
  CadenceRuntimeIntent,
  CadenceWorkspaceId,
  FabricSignalId,
  CadenceWorkspaceState,
} from '@domain/recovery-fabric-cadence-core';
import type { FabricCadenceWorkspaceUiState, FabricCadenceUiMetric } from '../types';

const commandBase: CadenceCommand = {
  planId: 'plan:orchestrator-bootstrap',
  operatorId: 'ui-operator',
  requestedSignalIds: ['signal:bootstrap'],
  requestedThroughput: 2.6,
  mode: 'stitch',
};

export const useRecoveryFabricCadenceWorkspace = (
  workspaceId: CadenceWorkspaceId,
): {
  readonly state: FabricCadenceWorkspaceUiState;
  readonly metrics: readonly FabricCadenceUiMetric[];
  readonly actions: {
    buildDraft: () => Promise<void>;
    executeDraft: (draftId: string) => Promise<void>;
    close: () => Promise<void>;
    setTab: (tab: FabricCadenceWorkspaceUiState['activeTab']) => void;
  };
} => {
  const orchestrator = useMemo(() => createCadenceOrchestrator(), []);
  const [state, setState] = useState<FabricCadenceWorkspaceUiState>({
    workspaceId,
    status: 'idle',
    activeTab: 'plans',
    outcomes: [],
    warnings: [],
  });
  const [intent, setIntent] = useState<CadenceRuntimeIntent | undefined>();

  const hydrate = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading' }));
    const loaded = await orchestrator.loadState(workspaceId);

    if (!loaded.ok) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        warnings: [loaded.error.message],
      }));
      return;
    }

    const baseState: CadenceWorkspaceState = loaded.value;
    const intentDraft: CadenceRuntimeIntent = {
      intentId: 'intent:bootstrap',
      tenantId: workspaceId,
      description: `seed workspace ${baseState.workspaceId}`,
      acceptedSignals: commandBase.requestedSignalIds,
      blockedSignals: [],
      confidence: 0.82,
      requestedAt: new Date().toISOString(),
    };

    setIntent(intentDraft);
    setState((previous) => ({
      ...previous,
      status: 'ready',
      activePlan: baseState.activePlan,
      activeIntent: intentDraft,
      lastRun: baseState.activeRun,
      health: baseState.lastHealth,
      warnings: [],
    }));
  }, [orchestrator, workspaceId]);

  const wrapOutcome = useCallback((outcome: OrchestrationOutcome) => {
    setState((previous) => ({
      ...previous,
      status: 'ready',
      outcomes: [outcome, ...previous.outcomes].slice(0, 12),
      draft: outcome.draft,
      activePlan: outcome.plan ?? previous.activePlan,
      lastRun: outcome.snapshot ?? previous.lastRun,
      health: outcome.state?.lastHealth ?? previous.health,
    }));
  }, []);

  const handleError = (result: { ok: false; error: OrchestratorError }) => {
    setState((previous) => ({
      ...previous,
      status: 'error',
      warnings: [
        `${result.error.code}: ${result.error.message}`,
        ...previous.warnings,
      ].slice(0, 6),
    }));
  };

  const buildDraft = useCallback(async () => {
    if (!intent) {
      return;
    }
    setState((previous) => ({ ...previous, status: 'running' }));

    const payload: CadenceCommand = {
      ...commandBase,
      requestedSignalIds: [...commandBase.requestedSignalIds, `signal:${workspaceId}:${Date.now()}`],
      requestedThroughput: intent.confidence * 10,
    };

    const created = await orchestrator.buildDraft(workspaceId, payload);
    if (!created.ok) {
      handleError(created);
      return;
    }

    wrapOutcome(created.value);
    await buildSignalsForActiveDraft(created.value, workspaceId, setState, orchestrator);
    setState((previous) => ({ ...previous, status: 'ready', warnings: previous.warnings }));
  }, [intent, workspaceId, orchestrator, wrapOutcome]);

  const executeDraft = useCallback(async (draftId: string) => {
    setState((previous) => ({ ...previous, status: 'running' }));
    const executed = await orchestrator.executeDraft(workspaceId, draftId);
    if (!executed.ok) {
      handleError(executed);
      return;
    }
    wrapOutcome(executed.value);
    setState((previous) => ({ ...previous, status: 'ready' }));
  }, [workspaceId, orchestrator, wrapOutcome]);

  const close = useCallback(async () => {
    const stopped = await orchestrator.closeAll(workspaceId);
    if (!stopped.ok) {
      handleError(stopped);
      return;
    }
    setState((previous) => ({ ...previous, status: 'idle', draft: undefined, activePlan: undefined }));
  }, [orchestrator, workspaceId]);

  const setTab = useCallback((next: FabricCadenceWorkspaceUiState['activeTab']) => {
    setState((previous) => ({ ...previous, activeTab: next }));
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const metrics: FabricCadenceUiMetric[] = useMemo(() => {
    const lastOutcome = state.outcomes[0];
    const activeWindowCount = lastOutcome?.snapshot?.completedWindows.length ?? 0;
    const risk = state.health ? ['red', 'amber', 'green'].indexOf(state.health.riskBand) : 0;

    return [
      {
        label: 'Active draft',
        value: state.draft ? 1 : 0,
        tone: state.draft ? 'ok' : 'neutral',
      },
      {
        label: 'Active windows',
        value: activeWindowCount,
        tone: activeWindowCount > 4 ? 'warn' : 'neutral',
      },
      {
        label: 'Risk band',
        value: risk,
        tone: risk > 1 ? 'error' : risk > 0 ? 'warn' : 'ok',
      },
      {
        label: 'Outcomes',
        value: state.outcomes.length,
        tone: state.outcomes.length > 6 ? 'warn' : 'neutral',
      },
      {
        label: 'Warnings',
        value: state.warnings.length,
        tone: state.warnings.length > 0 ? 'error' : 'ok',
      },
    ];
  }, [state.draft, state.health, state.outcomes, state.warnings]);

  return { state, metrics, actions: { buildDraft, executeDraft, close, setTab } };
};

const buildSignalsForActiveDraft = async (
  outcome: OrchestrationOutcome,
  workspaceId: CadenceWorkspaceId,
  setState: React.Dispatch<React.SetStateAction<FabricCadenceWorkspaceUiState>>,
  orchestrator: ReturnType<typeof createCadenceOrchestrator>,
): Promise<void> => {
  if (!outcome.draft) {
    return;
  }

  const acceptedSignals: FabricSignalId[] = outcome.draft.candidatePlan.nodeOrder.map((value) => `signal:${value}` as FabricSignalId);
  const updatedIntent = {
    intentId: `intent:${workspaceId}:${outcome.draft.draftId}` as const,
    tenantId: workspaceId,
    description: `post-build:${outcome.draft.draftId}`,
    acceptedSignals,
    blockedSignals: [] as FabricSignalId[],
    confidence: Math.max(0.12, Math.min(1, outcome.draft.candidatePlan.nodeOrder.length / 10)),
    requestedAt: new Date().toISOString(),
  };

  setState((previous) => ({
    ...previous,
    activeIntent: updatedIntent,
    warnings: previous.warnings,
  }));

  void orchestrator.loadState(workspaceId);
};
