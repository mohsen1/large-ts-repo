import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  draftPlanForScenario,
  buildRunSummary,
  runSimulation,
  createStatusText,
  createOrchestrationConfig,
  type OrchestratorStatus,
  type OrchestratorOutput,
  summarizeRun,
} from '@service/recovery-incident-lab-orchestrator';
import {
  type IncidentLabScenario,
  type IncidentLabPlan,
  type IncidentLabRun,
  createClock,
  validateScenario,
  validatePlan,
} from '@domain/recovery-incident-lab-core';
import { InMemoryRecoveryIncidentLabRepository, type RecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';

type WorkspaceMode = 'ready' | 'running' | 'stopped' | 'errored';

interface State {
  readonly mode: WorkspaceMode;
  readonly scenario?: IncidentLabScenario;
  readonly plan?: IncidentLabPlan;
  readonly output?: OrchestratorOutput;
  readonly status?: OrchestratorStatus;
  readonly notes: readonly string[];
}

const seedScenario: IncidentLabScenario = {
  id: 'scenario-incident-lab-alpha' as IncidentLabScenario['id'],
  labId: 'incident-lab' as IncidentLabScenario['labId'],
  name: 'Incident response drill for login platform',
  createdBy: 'ts-stress-runner',
  severity: 'critical',
  topologyTags: ['auth', 'identity', 'drill'],
  steps: [
    {
      id: 'login:step-1' as IncidentLabScenario['steps'][number]['id'],
      label: 'degrade upstream auth',
      command: 'fault-inject',
      expectedDurationMinutes: 4,
      dependencies: [],
      constraints: [{ key: 'latency', operator: 'lt', value: 200 }],
      owner: 'owner-auth' as IncidentLabScenario['steps'][number]['owner'],
    },
    {
      id: 'login:step-2' as IncidentLabScenario['steps'][number]['id'],
      label: 'route failover',
      command: 'route-switch',
      expectedDurationMinutes: 6,
      dependencies: ['login:step-1' as IncidentLabScenario['steps'][number]['id']],
      constraints: [{ key: 'error-rate', operator: 'gt', value: 5 }],
      owner: 'owner-platform' as IncidentLabScenario['steps'][number]['owner'],
    },
    {
      id: 'login:step-3' as IncidentLabScenario['steps'][number]['id'],
      label: 'verify recovery',
      command: 'health-check',
      expectedDurationMinutes: 2,
      dependencies: ['login:step-2' as IncidentLabScenario['steps'][number]['id']],
      constraints: [{ key: 'error-rate', operator: 'lt', value: 1 }],
      owner: 'owner-observer' as IncidentLabScenario['steps'][number]['owner'],
    },
  ],
  estimatedRecoveryMinutes: 12,
  owner: 'SRE',
  labels: ['alpha', 'ui'],
};

const summarizePlanRun = (run: IncidentLabRun): string => {
  const snapshot = summarizeRun(run);
  return `${snapshot.completed}/${snapshot.total} completed`;
};

export const useRecoveryIncidentLabWorkspace = (repository: RecoveryIncidentLabRepository = new InMemoryRecoveryIncidentLabRepository()) => {
  const [state, setState] = useState<State>({
    mode: 'ready',
    scenario: seedScenario,
    notes: ['seeded'],
  });

  const plan = useMemo<IncidentLabPlan | undefined>(() => {
    if (!state.scenario) {
      return undefined;
    }
    return draftPlanForScenario(state.scenario);
  }, [state.scenario]);

  const validate = useCallback(() => {
    if (!plan) {
      return 'missing plan';
    }
    const scenarioValidation = validateScenario(state.scenario as IncidentLabScenario);
    if (!scenarioValidation.ok) {
      return scenarioValidation.issues.join(',');
    }
    const verdict = validatePlan(plan);
    return verdict.ok ? 'valid' : verdict.issues.join(',');
  }, [plan, state.scenario]);

  useEffect(() => {
    if (state.scenario) {
      void repository.saveScenario(state.scenario);
    }
  }, [repository, state.scenario]);

  const launch = useCallback(async () => {
    if (!plan || !state.scenario) {
      setState((prev: State) => ({ ...prev, notes: [...prev.notes, 'cannot launch without scenario'] }));
      return;
    }

    setState((prev: State) => ({ ...prev, mode: 'running', notes: [...prev.notes, `launch ${createClock().now()}`] }));

    try {
      const output = await runSimulation(
        {
          scenario: state.scenario,
          plan,
          config: {
            batchSize: 2,
            sampleIntervalMs: 50,
            seed: 11,
            dryRun: false,
            targetThroughput: 5,
            jitterPercent: 5,
          },
        },
        {
          onEvent: async () => Promise.resolve(),
          shouldContinue: () => true,
        },
      );

      await repository.savePlan(plan);
      await repository.saveRun(output.run);
      const summary = buildRunSummary(output.run);
      const fallback = summarizePlanRun(output.run);
      const notes = [...state.notes, `run complete: ${summary} (${fallback})`];
      setState((prev: State) => ({ ...prev, mode: 'stopped', output, notes }));
    } catch (error) {
      setState((prev: State) => ({
        ...prev,
        mode: 'errored',
        notes: [...prev.notes, error instanceof Error ? error.message : 'orchestrator failure'],
      }));
    }
  }, [plan, repository, state.notes, state.scenario]);

  const summary = useMemo(() => {
    if (!state.output) {
      return 'No run executed';
    }
    return summarizePlanRun(state.output.run);
  }, [state.output]);

  const statusText = useMemo(() => {
    if (!state.status) {
      return 'idle';
    }
    return createStatusText(state.status);
  }, [state.status]);

  const simulationConfig = useMemo(() => createOrchestrationConfig({ throughput: plan?.selected.length, jitterPercent: 5 }), [plan]);

  return {
    state,
    plan,
    validate,
    launch,
    summary,
    statusText,
    simulationConfig,
  };
};
