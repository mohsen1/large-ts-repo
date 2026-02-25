import { useCallback, useMemo, useState } from 'react';
import type {
  OrchestrationInput,
  OrchestratorEnvelope,
  OrchestratorState,
  OrchestrationRunId,
} from '@service/recovery-synthesis-orchestrator';
import { RecoverySynthesisQuantumFacade } from '@service/recovery-synthesis-orchestrator';
import {
  asCommandId,
  asIncidentId,
  asMillis,
  asPercent,
  asScenarioConstraintId,
  asScenarioId,
  asScenarioProfileId,
  asScenarioSignalId,
  type ScenarioBlueprint,
} from '@domain/recovery-scenario-lens';

import { collectIterable } from '@shared/recovery-synthesis-runtime';

const buildBaselineBlueprint = (): ScenarioBlueprint => ({
  scenarioId: asScenarioId('scenario.quantum.synthetic'),
  incidentId: asIncidentId('incident.quantum.synthetic'),
  name: 'Quantum Synthesis Blueprint',
  windowMinutes: 45,
  baselineConfidence: asPercent(0.93),
  signals: [
    {
      signalId: asScenarioSignalId('sig-latency'),
      name: 'Latency spike',
      severity: 'critical',
      score: asPercent(0.9),
      observedAt: new Date().toISOString(),
      context: { detector: 'quantum-observer' },
      source: 'telemetry',
    },
    {
      signalId: asScenarioSignalId('sig-disconnect'),
      name: 'Peer disconnect',
      severity: 'warning',
      score: asPercent(0.5),
      observedAt: new Date().toISOString(),
      context: { detector: 'quantum-observer' },
      source: 'manual',
    },
  ],
  commands: [
    {
      commandId: asCommandId('cmd-gate'),
      commandName: 'Gate gateway',
      targetService: 'edge-gateway',
      estimatedDurationMs: asMillis(200000),
      resourceSpendUnits: 3,
      prerequisites: [],
      blastRadius: 1,
    },
    {
      commandId: asCommandId('cmd-safety-window'),
      commandName: 'Open safety window',
      targetService: 'recovery-orchestrator',
      estimatedDurationMs: asMillis(120000),
      resourceSpendUnits: 5,
      prerequisites: [asCommandId('cmd-gate')],
      blastRadius: 2,
    },
    {
      commandId: asCommandId('cmd-shift'),
      commandName: 'Shift workload',
      targetService: 'api-service',
      estimatedDurationMs: asMillis(320000),
      resourceSpendUnits: 7,
      prerequisites: [asCommandId('cmd-safety-window')],
      blastRadius: 3,
    },
  ],
  links: [
    { from: asCommandId('cmd-gate'), to: asCommandId('cmd-safety-window'), reason: 'hardening', coupling: 0.25 },
    { from: asCommandId('cmd-safety-window'), to: asCommandId('cmd-shift'), reason: 'handoff', coupling: 0.77 },
  ],
  policies: ['policy.quantum'],
});

export interface QuantumSynthesisState {
  readonly blueprint: ScenarioBlueprint;
  readonly selectedCommandId: string;
  readonly loading: boolean;
  readonly mode: 'plan' | 'simulate' | 'review';
  readonly runId: OrchestrationRunId | undefined;
  readonly envelope: OrchestratorEnvelope | undefined;
  readonly workspaceState: OrchestratorState;
}

export interface QuantumSynthesisActions {
  readonly runScenario: () => Promise<void>;
  readonly simulate: () => Promise<void>;
  readonly publish: () => Promise<void>;
  readonly selectCommand: (id: string) => void;
  readonly reset: () => void;
}

const defaultAdapters = {
  storage: {
    save: async () => {},
    load: async () => undefined,
  },
  publisher: {
    publish: async () => {},
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
};

export const useQuantumSynthesisWorkspace = () => {
  const [state, setState] = useState<QuantumSynthesisState>({
    blueprint: buildBaselineBlueprint(),
    selectedCommandId: asCommandId('cmd-gate'),
    loading: false,
    mode: 'plan',
    runId: undefined,
    envelope: undefined,
    workspaceState: {
      planHistory: [],
      activeSignals: [],
    },
  });

  const facade = useMemo(
    () => new RecoverySynthesisQuantumFacade(defaultAdapters),
    [],
  );

  const runScenario = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true }));
    const payload: OrchestrationInput = {
      blueprint: state.blueprint,
      profile: {
        profileId: asScenarioProfileId('quantum-profile'),
        name: 'Quantum Profile',
        maxParallelism: 3,
        maxBlastRadius: 4,
        maxRuntimeMs: asMillis(1000000),
        allowManualOverride: true,
        policyIds: ['policy.quantum'],
      },
      policyInputs: [
        {
          incidentSeverity: 'critical',
          tenant: 'core',
          services: ['api-service', 'edge-gateway'],
          region: 'us-east-1',
          availableOperators: 5,
        },
      ],
      constraints: [
        {
          constraintId: asScenarioConstraintId('quantum-parallelism'),
          type: 'max_parallelism',
          description: 'Keep command parallelism conservative',
          severity: 'warning',
          commandIds: state.blueprint.commands.map((command) => command.commandId),
          limit: 2,
        },
      ],
      signals: state.blueprint.signals,
      initiatedBy: 'recovery-dashboard',
    };

    const run = await facade.runOrchestration(payload);
    const history = facade.state.runs.map((entry) => entry.runId);
    const current = facade.state.current;

    setState((previous) => ({
      ...previous,
      loading: false,
      runId: run.runId,
        envelope: run.workspace.events.length === 0 ? undefined : ({
          ...previous.envelope,
          model: {
            scenarioId: current?.scenarioId ?? previous.blueprint.scenarioId,
            generatedAt: new Date().toISOString(),
            metadata: { runId: run.runId },
            blueprint: previous.blueprint,
            candidates: [],
        },
      } as OrchestratorEnvelope),
      mode: 'simulate',
      workspaceState: {
        ...previous.workspaceState,
        activeSignals: previous.workspaceState.activeSignals,
        planHistory: [...previous.workspaceState.planHistory, ...history],
      },
    }));
  }, [facade, state.blueprint, state.workspaceState.activeSignals, state.workspaceState.planHistory]);

  const simulate = useCallback(async () => {
    if (!state.runId) {
      return;
    }
    setState((previous) => ({ ...previous, loading: true }));
    await facade.publishRun(state.runId);
    setState((previous) => ({
      ...previous,
      loading: false,
      mode: 'review',
    }));
  }, [facade, state.runId]);

  const publish = useCallback(async () => {
    if (!state.runId) {
      return;
    }
    await facade.publishRun(state.runId);
  }, [facade, state.runId]);

  const selectCommand = useCallback((id: string) => {
    setState((previous) => ({ ...previous, selectedCommandId: id }));
  }, []);

  const reset = useCallback(() => {
    setState((previous) => ({
      ...previous,
      loading: false,
      mode: 'plan',
      runId: undefined,
      envelope: undefined,
      selectedCommandId: previous.blueprint.commands[0]?.commandId ?? previous.selectedCommandId,
      workspaceState: {
        ...previous.workspaceState,
        activeSignals: [],
      },
    }));
  }, []);

  const timeline = useMemo(
    () => collectIterable(state.envelope?.warnings ? state.envelope.warnings : ['ready']),
    [state.envelope?.warnings],
  );

  return {
    ...state,
    timeline,
    actions: {
      runScenario,
      simulate,
      publish,
      selectCommand,
      reset,
    } satisfies QuantumSynthesisActions,
  };
};
