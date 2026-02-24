import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createOrchestrationConfig,
  draftPlanForScenario,
  runSimulation,
  summarizeRun,
  type OrchestratorOutput,
} from '@service/recovery-incident-lab-orchestrator';
import {
  validatePlan,
  validateScenario,
  type IncidentLabPlan,
  type IncidentLabRun,
  type IncidentLabSignal,
  type IncidentLabScenario,
  type IncidentLabEnvelope,
} from '@domain/recovery-incident-lab-core';
import {
  InMemoryRecoveryIncidentLabRepository,
  type RecoveryIncidentLabRepository,
} from '@data/recovery-incident-lab-store';

interface OperationLog {
  readonly at: string;
  readonly action: string;
  readonly details: string;
}

type OperationMode = 'bootstrapped' | 'ready' | 'running' | 'errored' | 'stopped';

interface State {
  readonly statusText: string;
  readonly logs: readonly OperationLog[];
  readonly run?: IncidentLabRun;
  readonly plan?: IncidentLabPlan;
  readonly scenario?: IncidentLabScenario;
  readonly output?: OrchestratorOutput;
  readonly surfaceSummary: readonly string[];
  readonly envelopes: readonly string[];
}

type TelemetrySignal = Pick<IncidentLabEnvelope, 'id' | 'payload' | 'createdAt'> & { readonly kind: IncidentLabSignal['kind'] };

const initialSeed: IncidentLabScenario = {
  id: 'recovery:incident:seed' as IncidentLabScenario['id'],
  labId: 'incident-lab' as IncidentLabScenario['labId'],
  name: 'Automated recovery stress operations',
  createdBy: 'ts-stress-runner',
  severity: 'critical',
  topologyTags: ['orchestrator', 'recovery', 'incident'],
  steps: [
    {
      id: 'seed:step-1' as IncidentLabScenario['steps'][number]['id'],
      label: 'validate target topology',
      command: 'verify',
      expectedDurationMinutes: 2,
      dependencies: [],
      constraints: [{ key: 'availability', operator: 'gt', value: 99.9 }],
      owner: 'incident-owner' as IncidentLabScenario['steps'][number]['owner'],
    },
    {
      id: 'seed:step-2' as IncidentLabScenario['steps'][number]['id'],
      label: 'switch dependency policy',
      command: 'switch',
      expectedDurationMinutes: 3,
      dependencies: ['seed:step-1' as IncidentLabScenario['steps'][number]['id']],
      constraints: [{ key: 'latency', operator: 'lt', value: 500 }],
      owner: 'incident-owner' as IncidentLabScenario['steps'][number]['owner'],
    },
    {
      id: 'seed:step-3' as IncidentLabScenario['steps'][number]['id'],
      label: 'complete failover',
      command: 'complete',
      expectedDurationMinutes: 1,
      dependencies: ['seed:step-2' as IncidentLabScenario['steps'][number]['id']],
      constraints: [{ key: 'error-rate', operator: 'lt', value: 0.1 }],
      owner: 'incident-owner' as IncidentLabScenario['steps'][number]['owner'],
    },
  ],
  estimatedRecoveryMinutes: 7,
  owner: 'SRE',
  labels: ['seed', 'operations'],
};

const summarizeRunText = (run?: IncidentLabRun): string => {
  if (!run) {
    return 'No run executed';
  }
  const snapshot = summarizeRun(run);
  return `${snapshot.completed}/${snapshot.total} completed (${snapshot.failed} failed)`;
};

const appendLog = (state: State, action: string, details: string): State => ({
  ...state,
  statusText: `${action}: ${details}`,
  logs: [
    ...state.logs,
    {
      at: new Date().toISOString(),
      action,
      details,
    },
  ],
});

const buildSurfaceSummary = (run?: IncidentLabRun): readonly string[] => {
  if (!run) {
    return [];
  }

  const stepsDone = run.results.filter((entry) => entry.status === 'done').length;
  const stepsFailed = run.results.filter((entry) => entry.status === 'failed').length;
  const stepsSkipped = run.results.filter((entry) => entry.status === 'skipped').length;

  return [
    `steps=${run.results.length}`,
    `done=${stepsDone}`,
    `failed=${stepsFailed}`,
    `skipped=${stepsSkipped}`,
    `state=${run.state}`,
  ];
};

const buildTelemetrySignals = (output?: OrchestratorOutput): readonly TelemetrySignal[] => {
  if (!output) {
    return [];
  }

  return output.telemetry.map((telemetry, index) => ({
    id: telemetry.id,
    payload: telemetry.payload,
    createdAt: telemetry.createdAt,
    kind: index % 4 === 0 ? 'capacity' : index % 4 === 1 ? 'latency' : index % 4 === 2 ? 'integrity' : 'dependency',
  }));
};

export const useRecoveryLabOperations = (repository: RecoveryIncidentLabRepository = new InMemoryRecoveryIncidentLabRepository()) => {
  const [state, setState] = useState<State>({
    statusText: 'ready',
    logs: [{ at: new Date().toISOString(), action: 'init', details: 'recovery lab operations initialized' }],
    scenario: initialSeed,
    surfaceSummary: [],
    envelopes: [],
  });

  const [mode, setMode] = useState<OperationMode>('bootstrapped');

  useEffect(() => {
    if (state.scenario) {
      void repository.saveScenario(state.scenario);
    }
  }, [repository, state.scenario]);

  const plan = useMemo<IncidentLabPlan | undefined>(() => {
    if (!state.scenario) {
      return undefined;
    }
    return draftPlanForScenario(state.scenario);
  }, [state.scenario]);

  const validate = useCallback(() => {
    if (!state.scenario || !plan) {
      return 'Missing scenario or plan';
    }
    const scenarioValidation = validateScenario(state.scenario);
    if (!scenarioValidation.ok) {
      return scenarioValidation.issues.join('|');
    }
    const planValidation = validatePlan(plan);
    return planValidation.ok ? 'valid' : planValidation.issues.join('|');
  }, [plan, state.scenario]);

  const launch = useCallback(async () => {
    if (!state.scenario || !plan) {
      setMode('errored');
      setState((current) => appendLog(current, 'launch', 'Missing scenario or plan'));
      return;
    }

    const config = createOrchestrationConfig({ throughput: plan.selected.length, jitterPercent: 3 });
    setMode('running');
    setState((current) => appendLog(current, 'launch', 'starting simulation run'));

    try {
      const output = await runSimulation(
        {
          scenario: state.scenario,
          plan,
          config: {
            batchSize: config.maxParallelism,
            sampleIntervalMs: 30,
            seed: 17,
            dryRun: false,
            targetThroughput: config.targetThroughput,
            jitterPercent: config.jitterPercent,
          },
        },
        {
          onEvent: async () => Promise.resolve(),
          shouldContinue: () => true,
        },
      );

      await repository.savePlan(plan);
      await repository.saveRun(output.run);

      const envelopeIds = buildTelemetrySignals(output).map((telemetrySignal) => telemetrySignal.id);
      const surfaceSummary = buildSurfaceSummary(output.run);

      setMode('stopped');
      setState((current) =>
        appendLog(
          {
            ...current,
            run: output.run,
            output,
            plan,
            surfaceSummary,
            envelopes: ['run', ...envelopeIds, ...current.envelopes].slice(0, 10),
          },
          'launch',
          `run ${output.run.runId} completed`,
        ),
      );
    } catch (error) {
      setMode('errored');
      setState((current) => appendLog(current, 'error', error instanceof Error ? error.message : 'simulation failed'));
    }
  }, [plan, repository, state.scenario]);

  const reset = useCallback(() => {
    setMode('bootstrapped');
    setState((current) =>
      appendLog(
        {
          ...current,
          run: undefined,
          output: undefined,
          plan: undefined,
          surfaceSummary: [],
          envelopes: [],
        },
        'reset',
        'workspace cleared',
      ),
    );
  }, []);

  const logs = useMemo(
    () =>
      [...state.logs]
        .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
        .slice(0, 12),
    [state.logs],
  );

  const statusText = useMemo(() => {
    if (mode === 'running') return 'running';
    if (mode === 'errored') return 'errored';
    if (mode === 'stopped') return 'complete';
    return validate() === 'valid' ? 'ready' : 'needs-input';
  }, [mode, validate]);

  return {
    state,
    mode,
    statusText,
    summary: summarizeRunText(state.run),
    logs,
    surfaceSummary: state.surfaceSummary,
    validate,
    launch,
    reset,
    config: createOrchestrationConfig({ throughput: state.run ? state.run.results.length : plan?.selected.length ?? 3, jitterPercent: 4 }),
    envelopes: state.envelopes,
    telemetrySignals: buildTelemetrySignals(state.output),
  };
};
