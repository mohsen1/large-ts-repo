import { runPlanner } from './planner';
import { runSimulation } from './simulator';
import { asPercent, asMillis, type ScenarioPlan } from '@domain/recovery-scenario-lens';
import { choosePlan, toScenarioPlan } from '@domain/recovery-scenario-lens/risk';
import type { OrchestratorAdapterBundle, OrchestratorRuntimeSnapshot } from './adapters';
import type {
  OrchestrationInput,
  OrchestratorEnvelope,
  OrchestratorState,
  OrchestrationRunId,
  SimulationOutput,
} from './types';

const createRunId = (): OrchestrationRunId => `${Date.now()}-orchestration-run` as unknown as OrchestrationRunId;

export class RecoverySynthesisOrchestrator {
  private state: OrchestratorState = {
    planHistory: [],
    activeSignals: [],
  };

  private lastPlan?: ScenarioPlan;

  constructor(private readonly adapters: OrchestratorAdapterBundle) {}

  async orchestrate(input: OrchestrationInput): Promise<OrchestratorEnvelope> {
    const plannerResult = runPlanner(input);
    const candidate = choosePlan(plannerResult.candidates);
    if (!candidate) {
      throw new Error('No plan candidate could be produced');
    }

    const plan = toScenarioPlan(candidate);
    this.lastPlan = plan;

    const envelope = await this.buildEnvelope(input, createRunId(), plannerResult, plan);
    this.state = {
      currentRun: envelope,
      planHistory: [...this.state.planHistory, envelope.runId],
      activeSignals: input.signals,
    };

    await this.adapters.storage.save(envelope.model);
    await this.adapters.publisher.publish('synthesis.orchestrated', {
      runId: envelope.runId,
      status: envelope.status,
      scenarioId: envelope.model.scenarioId,
    });

    return envelope;
  }

  async simulate(plan: ScenarioPlan): Promise<SimulationOutput> {
    if (!this.state.currentRun) {
      throw new Error('No active orchestration run available');
    }

    const input = {
      blueprint: this.state.currentRun.model.blueprint,
      policyInputs: [],
      profile: this.state.currentRun.model.blueprint as unknown as OrchestrationInput['profile'],
      constraints: plan.constraints,
      signals: this.state.currentRun.model.blueprint.signals,
      initiatedBy: this.state.currentRun.status,
    } satisfies OrchestrationInput;

    const output = runSimulation(input, this.state, plan);
    await this.adapters.publisher.publish('synthesis.simulated', {
      runId: this.state.currentRun.runId,
      planId: plan.planId,
      violations: output.violations,
    });

    return output;
  }

  async snapshot(): Promise<OrchestratorRuntimeSnapshot> {
    if (!this.state.currentRun) {
      throw new Error('No active run');
    }

    return {
      timestamp: new Date().toISOString(),
      envelope: this.state.currentRun,
      currentRun: this.state.currentRun,
    };
  }

  private async buildEnvelope(
    input: OrchestrationInput,
    runId: OrchestrationRunId,
    plannerResult: ReturnType<typeof runPlanner>,
    plan: ScenarioPlan,
  ): Promise<OrchestratorEnvelope> {
    return {
      runId,
      status: 'ready',
      model: {
        scenarioId: input.blueprint.scenarioId,
        generatedAt: new Date().toISOString(),
        metadata: {
          initiatedBy: input.initiatedBy,
        },
        blueprint: input.blueprint,
        candidates: [],
        activePlan: plan,
      },
      warnings: plannerResult.warnings,
      metrics: {
        tags: ['synthesis'],
        score: plannerResult.score.overall,
        completionRate: asPercent(plannerResult.score.overall),
        meanTimeToRecoveryMs: asMillis(120000),
        errorRate: plannerResult.score.overall < 0.5 ? 0.3 : 0,
        stressIndex: plannerResult.constraints.length,
      },
    };
  }

  get activePlan(): ScenarioPlan | undefined {
    return this.lastPlan;
  }
}
