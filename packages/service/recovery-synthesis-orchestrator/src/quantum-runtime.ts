import type { PluginOutput, SynthesisTraceId } from '@shared/recovery-synthesis-runtime';
import { collectIterable } from '@shared/recovery-synthesis-runtime';
import { createSynthesis } from '@domain/recovery-scenario-lens/synthesis-runtime';
import type {
  SynthesisInput,
  SynthesisWorkspace,
} from '@domain/recovery-scenario-lens/synthesis-types';
import {
  asIncidentId,
  asMillis,
  asPercent,
  asPlanCandidateId,
  asScenarioConstraintId,
  asScenarioId,
  asScenarioProfileId,
  type ScenarioBlueprint,
  type ScenarioReadModel,
} from '@domain/recovery-scenario-lens';
import type {
  OrchestratorEnvelope,
  OrchestratorState,
  OrchestrationInput,
  OrchestrationRunId,
} from './types';
import { OrchestratorAdapterBundle } from './adapters';
import { toScenarioPlan } from '@domain/recovery-scenario-lens/risk';
import { runPlanner } from './planner';
import { runSimulation } from './simulator';

const toRuntimeInput = (input: OrchestrationInput): SynthesisInput => ({
  traceId: `trace.${Date.now()}` as SynthesisTraceId,
  blueprint: input.blueprint,
  profile: input.profile,
  constraints: input.constraints,
  signals: input.signals,
  policyIds: input.policyInputs.map((policy) => policy.tenant ?? 'policy'),
});

const defaultBlueprint = (): ScenarioBlueprint => ({
  scenarioId: asScenarioId('scenario.quantum-fallback'),
  incidentId: asIncidentId('incident.quantum-fallback'),
  name: 'Fallback blueprint',
  windowMinutes: 30,
  baselineConfidence: asPercent(0.5),
  signals: [],
  commands: [],
  links: [],
  policies: ['policy.fallback'],
});

const createRunId = (): OrchestrationRunId => `${Date.now()}-run` as OrchestrationRunId;

export interface QuantumRuntimeEvent {
  readonly runId: OrchestrationRunId;
  readonly kind: 'started' | 'updated' | 'completed' | 'failed';
  readonly at: string;
  readonly details: string;
}

export interface QuantumSynthesisRun {
  readonly runId: OrchestrationRunId;
  readonly workspace: SynthesisWorkspace;
  readonly pluginOutputs: readonly PluginOutput<unknown>[];
}

interface QuantumState {
  readonly current: ScenarioReadModel | undefined;
  readonly runs: readonly QuantumSynthesisRun[];
}

const buildToEnvelope = (runId: OrchestrationRunId, input: OrchestrationInput, workspace: SynthesisWorkspace): OrchestratorEnvelope => {
  const allSignals = [...input.signals];
  const commandFrames = collectIterable(workspace.timeline.flatMap((entry) => entry.commandOrder)).map((command) => ({
    commandId: command.commandId,
    commandName: command.commandName,
    targetService: command.targetService,
    estimatedDurationMs: command.estimatedDurationMs,
    resourceSpendUnits: command.resourceSpendUnits,
    prerequisites: command.prerequisites,
    blastRadius: command.blastRadius,
  }));

  const warnings = workspace.events.length === 0 ? ['empty workspace'] : ['synthesis timeline executed'];

  return {
    runId,
    status: 'ready',
    model: {
      scenarioId: input.blueprint.scenarioId,
      generatedAt: new Date().toISOString(),
      metadata: {
        workspaceRuntime: workspace.runtimeId,
      },
      blueprint: {
        scenarioId: input.blueprint.scenarioId,
        incidentId: input.blueprint.incidentId,
        name: input.blueprint.name,
        windowMinutes: input.blueprint.windowMinutes,
        baselineConfidence: input.blueprint.baselineConfidence,
        signals: allSignals,
        commands: commandFrames,
        links: input.blueprint.links,
        policies: input.blueprint.policies,
      },
      candidates: [
        {
          candidateId: asPlanCandidateId(`candidate.${workspace.runtimeId}`),
          blueprintId: input.blueprint.scenarioId,
          orderedCommandIds: commandFrames.map((command) => command.commandId),
          windows: [],
          score: 0.9,
          risk: 0,
          resourceUse: commandFrames.length,
        },
      ],
      activePlan: workspace.latestOutput?.plan,
    },
    warnings,
    metrics: {
      tags: ['quantum', workspace.runtimeId],
      score: workspace.timeline.length,
      completionRate: asPercent(1),
      meanTimeToRecoveryMs: asMillis(10_000),
      errorRate: 0,
      stressIndex: workspace.timeline.length,
    },
  };
};

export class RecoverySynthesisQuantumFacade {
  readonly #runtime = createSynthesis({ runtimeId: 'quantum-runtime', labels: { tenant: 'recovery' } });
  readonly #runs: QuantumSynthesisRun[] = [];
  #current?: ScenarioReadModel;

  constructor(private readonly adapters: OrchestratorAdapterBundle) {}

  get state(): QuantumState {
    return {
      current: this.#current,
      runs: this.#runs,
    };
  }

  async runOrchestration(input: OrchestrationInput): Promise<QuantumSynthesisRun> {
    const runId = createRunId();
    await this.adapters.publisher.publish('quantum.started', { runId, tenant: input.initiatedBy });

    const runtimeResult = await this.#runtime.execute(toRuntimeInput(input));
    const envelope = this.buildEnvelope(runId, input, runtimeResult.workspace);

    await this.adapters.storage.save(envelope.model);
    await this.adapters.publisher.publish('quantum.completed', {
      runId,
      stageCount: runtimeResult.stages.length,
      score: envelope.metrics.score,
    });

    const pluginOutputs: PluginOutput<unknown>[] = runtimeResult.stages.map((stage, index) => ({
      status: 'success',
      payload: { runId, index, stage },
      latencyMs: index,
      artifacts: ['quantum-runtime-plugin'],
      messages: ['runtime stage observed'],
      next: [],
    }));

    const run: QuantumSynthesisRun = {
      runId,
      workspace: runtimeResult.workspace,
      pluginOutputs,
    };

    this.#current = envelope.model;
    this.#runs.push(run);
    return run;
  }

  async runWithExistingState(state: OrchestratorState): Promise<OrchestratorEnvelope> {
    const blueprint: ScenarioBlueprint = state.currentRun?.model.blueprint ?? defaultBlueprint();
    const runInput: OrchestrationInput = {
      blueprint,
      profile: {
        profileId: asScenarioProfileId(`profile.${Date.now()}`),
        name: 'quantum-replay',
        maxParallelism: 1,
        maxBlastRadius: 5,
        maxRuntimeMs: asMillis(120_000),
        allowManualOverride: true,
        policyIds: [],
      },
      policyInputs: [],
      constraints:
        state.currentRun?.model.activePlan?.constraints.length
          ? state.currentRun.model.activePlan.constraints
          : [
              {
                constraintId: asScenarioConstraintId(`replay.max-parallelism.${Date.now()}`),
                type: 'max_parallelism',
                description: 'fallback replay constraint',
                severity: 'warning',
                commandIds: [],
                limit: 1,
              },
            ],
      signals: blueprint.signals,
      initiatedBy: 'quantum-runtime-replay',
    };

    const plannerResult = runPlanner(runInput);
    const topCandidate = plannerResult.candidates[0];

    if (!topCandidate) {
      return {
        runId: createRunId(),
        status: 'failed',
        model: {
          scenarioId: blueprint.scenarioId,
          generatedAt: new Date().toISOString(),
          metadata: {
            workspaceRuntime: 'quantum-runtime',
          },
          blueprint,
          candidates: [],
        },
        warnings: ['No candidate generated from replay input'],
        metrics: {
          tags: ['quantum', 'replay', 'failed'],
          score: 0,
          completionRate: asPercent(0),
          meanTimeToRecoveryMs: asMillis(0),
          errorRate: 1,
          stressIndex: runInput.constraints.length,
        },
      };
    }

    const plan = toScenarioPlan(topCandidate);
    const simulation = runSimulation(runInput, state, plan);

    return {
      runId: createRunId(),
      status: 'simulated',
      model: {
        scenarioId: blueprint.scenarioId,
        generatedAt: new Date().toISOString(),
        metadata: {
          workspaceRuntime: 'quantum-runtime',
        },
        blueprint,
        candidates: [
          {
            candidateId: topCandidate.candidateId,
            blueprintId: blueprint.scenarioId,
            orderedCommandIds: topCandidate.orderedCommandIds,
            windows: topCandidate.windows,
            score: topCandidate.score,
            risk: topCandidate.risk,
            resourceUse: topCandidate.resourceUse,
          },
        ],
        activePlan: plan,
        lastSimulation: simulation.simulation,
      },
      warnings: plannerResult.warnings,
      metrics: {
        tags: ['quantum', 'replay'],
        score: plannerResult.score.overall,
        completionRate: asPercent(plannerResult.score.overall),
        meanTimeToRecoveryMs: plan.expectedFinishMs,
        errorRate: 0,
        stressIndex: simulation.violations.length,
      },
    };
  }

  async publishRun(runId: OrchestrationRunId): Promise<QuantumRuntimeEvent> {
    await this.adapters.publisher.publish('quantum.publish', { runId });
    return {
      runId,
      kind: 'completed',
      at: new Date().toISOString(),
      details: `run ${runId} published`,
    };
  }

  async snapshot(): Promise<OrchestratorState> {
    if (!this.#current) {
      throw new Error('No active orchestration state');
    }

    return {
      currentRun: {
        runId: createRunId(),
        status: 'ready',
        model: this.#current,
        warnings: this.#runs.length === 0 ? ['no runs yet'] : ['active'],
        metrics: {
          tags: ['quantum', 'snapshot'],
          score: this.#runs.length,
          completionRate: asPercent(Math.min(1, this.#runs.length / 10)),
          meanTimeToRecoveryMs: asMillis(5_000),
          errorRate: 0,
          stressIndex: this.#runs.length,
        },
      },
      planHistory: this.#runs.map((run) => run.runId),
      activeSignals: this.#current.blueprint.signals,
    };
  }

  private buildEnvelope(runId: OrchestrationRunId, input: OrchestrationInput, workspace: SynthesisWorkspace): OrchestratorEnvelope {
    return buildToEnvelope(runId, input, workspace);
  }
}
