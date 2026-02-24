import { useMemo } from 'react';
import {
  buildControlEventName,
  buildControlTimeline,
  controlStages,
  createClock,
  type AnyControlInput,
  type ControlPolicyOutput,
  type ControlRunResult,
  type ControlStage,
  mergePolicyWarnings,
  evaluateLabPolicy,
  type ControlTimelineBucket,
  toAsyncObservationStream,
} from '@domain/recovery-incident-lab-core';
import type {
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabScenario,
  RunId,
} from '@domain/recovery-incident-lab-core';
import { runAdvancedScenarios, type AdvancedOrchestrationInput } from '@service/recovery-incident-lab-orchestrator';
import { InMemoryRecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';
import { mapScenarioToAdapter, buildRegistryAdapter } from '../adapters/recoveryLabRegistryAdapter';

export interface ControlAction {
  readonly action: 'seed' | 'run' | 'evaluate' | 'report';
  readonly at: string;
  readonly index: number;
}

type ControlSignals = readonly ['capacity', 'latency', 'integrity', 'dependency'];

export interface ControlPlaneState {
  readonly workspaceId: string;
  readonly stage: ControlStage;
  readonly mode: 'idle' | 'running' | 'ready' | 'error';
  readonly scenarioId: IncidentLabScenario['id'] | undefined;
  readonly planId: IncidentLabPlan['id'] | undefined;
  readonly runId: RunId | undefined;
  readonly events: readonly string[];
  readonly policies: readonly ControlPolicyOutput<ControlSignals>[];
  readonly timelineWarnings: readonly string[];
  readonly diagnostics: readonly string[];
}

interface InternalState {
  readonly workspaceSeed: string;
}

const createWorkspaceId = (seed: string): string => `workspace:${seed}`;

const defaultState: ControlPlaneState & InternalState = {
  workspaceId: createWorkspaceId('recovery-incident-control'),
  workspaceSeed: 'recovery-incident-control',
  stage: 'prepare',
  mode: 'idle',
  scenarioId: undefined,
  planId: undefined,
  runId: undefined,
  events: [],
  policies: [],
  timelineWarnings: [],
  diagnostics: [],
};

const buildPolicyInput = (scenario: IncidentLabScenario, plan: IncidentLabPlan, signals: ControlSignals): AnyControlInput => ({
  scenario,
  plan,
  signals,
  governanceSignals: [],
});

const toRunId = (value: string): RunId => value as RunId;

export class RecoveryLabControlService {
  #state: ControlPlaneState & InternalState = defaultState;
  #events: ControlAction[] = [];
  #setState: (state: ControlPlaneState) => void = () => {};
  #repository = new InMemoryRecoveryIncidentLabRepository();

  constructor(setState: (state: ControlPlaneState) => void) {
    this.#setState = setState;
  }

  get state(): ControlPlaneState {
    return this.#state;
  }

  get events(): readonly ControlAction[] {
    return [...this.#events];
  }

  private setState(next: ControlPlaneState & InternalState): void {
    this.#state = { ...this.#state, ...next };
    this.#setState({
      workspaceId: this.#state.workspaceId,
      stage: this.#state.stage,
      mode: this.#state.mode,
      scenarioId: this.#state.scenarioId,
      planId: this.#state.planId,
      runId: this.#state.runId,
      events: this.#state.events,
      policies: this.#state.policies,
      timelineWarnings: this.#state.timelineWarnings,
      diagnostics: this.#state.diagnostics,
    });
  }

  bootstrap(seed: string): ControlPlaneState {
    this.setState({
      ...defaultState,
      workspaceSeed: seed,
      workspaceId: createWorkspaceId(seed),
      events: [buildControlEventName('tenant', 'input', 0), ...controlStages],
    });
    return this.#state;
  }

  async buildTimeline(input: AnyControlInput, run: IncidentLabRun): Promise<void> {
    const controlEvents = [
      {
        name: buildControlEventName('runtime', 'observe', 0),
        bucket: `${run.runId}::runtime` as ControlTimelineBucket,
        emittedAt: new Date().toISOString(),
        payload: {
          stages: controlStages,
          scenario: input.scenario.id,
        },
      },
    ];
    const timeline = await buildControlTimeline(run, controlEvents, this.#state.timelineWarnings);
    this.setState({
      ...this.#state,
      mode: 'ready',
      timelineWarnings: mergePolicyWarnings(this.#state.timelineWarnings, timeline.warnings),
      events: timeline.windows.flatMap((window) => window.events.map((event) => event.name)),
    });
  }

  private extractLatestRun = async (scenarioId: IncidentLabScenario['id']): Promise<IncidentLabRun> => {
    const latest = await this.#repository.loadLatestRunByScenario(scenarioId);
    if (latest.ok) {
      return latest.value;
    }

    return {
      runId: toRunId(`${scenarioId}:fallback`),
      planId: `${scenarioId}:plan`,
      scenarioId,
      startedAt: createClock().now(),
      completeBy: undefined,
      state: 'ready',
      results: [],
    };
  };

  async runWithScenario(
    scenario: IncidentLabScenario,
    plan: IncidentLabPlan,
  ): Promise<ControlRunResult | undefined> {
    const signals = ['capacity', 'latency', 'integrity', 'dependency'] as const;
    const orchestrationInput: AdvancedOrchestrationInput = {
      scenarios: [scenario],
      mode: 'adaptive',
      jitterPercent: 2,
      includeTelemetry: true,
    };
    const policy = evaluateLabPolicy({
      scenario,
      plan,
      signals,
      governanceSignals: [],
    });
    const policyInput = buildPolicyInput(scenario, plan, signals);

    const bootstrapRunId = toRunId(`${scenario.id}:control:${createClock().now()}`);
    this.setState({
      ...this.#state,
      mode: 'running',
      scenarioId: scenario.id,
      planId: plan.id,
      runId: bootstrapRunId,
      diagnostics: [...this.#state.diagnostics, `run:${bootstrapRunId}`],
      events: [...this.#state.events, 'run:start'],
    });

    const adapter = mapScenarioToAdapter({
      namespace: `${this.#state.workspaceSeed}:control`,
      scenario,
      run: {
        runId: bootstrapRunId,
        planId: plan.id,
        scenarioId: scenario.id,
        startedAt: createClock().now(),
        completeBy: undefined,
        state: 'active',
        results: [],
      },
      plan,
      signals,
    });

    const adapterSummary = await buildRegistryAdapter({
      namespace: adapter.namespace,
      scenarioId: String(scenario.id),
      counts: [plan.selected.length, plan.queue.length, signals.length],
    });

    for await (const record of toAsyncObservationStream(adapterSummary.timeline)) {
      this.#events.push({
        action: 'run',
        at: record.at,
        index: this.#events.length,
      });
      if (this.#events.length > 1000) {
        this.#events.shift();
      }
    }

    try {
      const output = await runAdvancedScenarios(orchestrationInput, this.#repository);
      const run = await this.extractLatestRun(scenario.id);
      await this.buildTimeline(policyInput, run);

      this.setState({
        ...this.#state,
        mode: 'ready',
        diagnostics: [...this.#state.diagnostics, `policy-readiness:${policy.readinessScore}`, `window:${run.runId}`],
        events: [...this.#state.events, ...policy.warnings, ...adapterSummary.timeline],
        policies: [...this.#state.policies, policy],
      });

      return {
        runId: run.runId,
        scenarioId: scenario.id,
        stage: 'close',
        score: policy.readinessScore,
        output: [...output.output],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run failure';
      this.setState({
        ...this.#state,
        mode: 'error',
        diagnostics: [...this.#state.diagnostics, message],
      });
      return undefined;
    }
  }
}

export const useRecoveryLabControlService = (setState: (state: ControlPlaneState) => void): RecoveryLabControlService =>
  useMemo(() => new RecoveryLabControlService(setState), [setState]);
