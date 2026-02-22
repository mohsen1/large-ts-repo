import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  buildExecutionPlan,
  createRecoveryRunState,
  isRunRecoverable,
  topologicalOrder,
  simulateRun,
  type RecoveryProgram,
  type RecoveryRunId,
  type RecoveryRunState,
  type RecoveryStep,
} from '@domain/recovery-orchestration';
import type { RiskDimension, RiskSignal } from '@domain/recovery-risk-models';
import {
  type RecoveryArtifactRepository,
  type RecoveryRunRepository,
} from '@data/recovery-artifacts';
import type { RecoveryArtifact } from '@data/recovery-artifacts';
import type { RecoveryCheckpoint } from '@domain/recovery-orchestration';
import type { RiskRunId } from '@domain/recovery-risk-models';
import {
  InMemoryRecoveryPolicyRepository,
  type RecoveryPolicyRepository,
} from '@data/recovery-policy-store';
import { RecoveryAdvisor, RecoveryObservabilityCoordinatorImpl } from '@data/recovery-observability/src';
import type { RecoverySuggestion } from '@data/recovery-observability/src';
import type { RecoveryNotifier } from '@infrastructure/recovery-notifications';
import { RecoveryExecutor } from './executor';
import { scheduleProgram, shouldThrottle } from './scheduler';
import { RecoveryPolicyEngine } from '@service/recovery-policy-engine';
import type { RecoveryPolicyEngine as PolicyEngine } from '@service/recovery-policy-engine';
import { InMemoryRecoveryRiskRepository, type RecoveryRiskRepository } from '@data/recovery-risk-store';
import { RecoveryRiskEngine, type RiskEngineDependencies } from '@service/recovery-risk-engine';
import {
  RecoveryPlanOrchestrator,
} from '@service/recovery-plan-orchestrator';
import { RecoveryCoordinationOrchestrator } from '@service/recovery-coordination-orchestrator';
import {
  parseSimulationProfile,
  runAndEmitSimulationEvents,
  summarizeSimulation,
} from '@domain/recovery-simulation-planning';
import type {
  SimulationInput,
  SimulationSummary,
  RecoverySimulationId,
} from '@domain/recovery-simulation-planning';

interface RecoveryCommandContext {
  command: string;
  requestedBy: string;
  correlationId: string;
}

export interface RecoveryRunnerOptions {
  runRepository: RecoveryRunRepository;
  artifactRepository: RecoveryArtifactRepository;
  notifier: RecoveryNotifier;
  policyRepository?: RecoveryPolicyRepository;
  policyEngine?: PolicyEngine;
  riskRepository?: RecoveryRiskRepository;
  planOrchestrator?: RecoveryPlanOrchestrator;
  coordinationOrchestrator?: RecoveryCoordinationOrchestrator;
}

const defaultStepExecutor = async () => 0;

export class RecoveryOrchestrator {
  private readonly executor: RecoveryExecutor;
  private readonly policyEngine: PolicyEngine;
  private readonly advisor: RecoveryAdvisor;
  private readonly riskEngine: RecoveryRiskEngine;
  private readonly planOrchestrator: RecoveryPlanOrchestrator;
  private readonly coordinationOrchestrator: RecoveryCoordinationOrchestrator;

  constructor(private readonly options: RecoveryRunnerOptions) {
    this.executor = new RecoveryExecutor(
      this.options.runRepository,
      this.options.artifactRepository,
      this.options.notifier,
      defaultStepExecutor,
    );

    const repository = this.options.policyRepository ?? new InMemoryRecoveryPolicyRepository();
    this.policyEngine = this.options.policyEngine ?? new RecoveryPolicyEngine(repository);
    this.advisor = new RecoveryAdvisor(this.options.artifactRepository);
    const riskRepository = this.options.riskRepository ?? new InMemoryRecoveryRiskRepository();
    const dependencies: RiskEngineDependencies = {
      riskRepository,
      policyRepository: repository,
    };
    this.riskEngine = new RecoveryRiskEngine(dependencies);
    this.planOrchestrator = this.options.planOrchestrator ??
      new RecoveryPlanOrchestrator(this.policyEngine, this.riskEngine);
    this.coordinationOrchestrator = this.options.coordinationOrchestrator ??
      new RecoveryCoordinationOrchestrator({
        policyEngine: this.policyEngine,
        riskEngine: this.riskEngine,
        planOrchestrator: this.planOrchestrator,
      });
  }

  async initiateRecovery(program: RecoveryProgram, context: RecoveryCommandContext): Promise<Result<RecoveryRunState, Error>> {
    const runState = createRecoveryRunState({
      runId: `${program.id}:${context.correlationId}`,
      programId: program.id,
      incidentId: `${context.correlationId}:${context.requestedBy}`,
      estimatedRecoveryTimeMinutes: 15,
    });
    const simulatedSummary = this.runSimulation(program, context, runState);
    void simulatedSummary.then((value) => {
      if (value.ok) {
        this.logSimulationHint(runState.runId, value.value);
      }
    });

    const coordination = await this.coordinationOrchestrator.coordinate({
      commandId: `${runState.runId}:coordination` ,
      tenant: `${program.tenant}`,
      program,
      runId: runState.runId,
      runState,
      context: {
        requestedBy: context.requestedBy,
        tenant: `${program.tenant}`,
        correlationId: context.correlationId,
      },
    });
    if (!coordination.ok) {
      return fail(coordination.error);
    }
    if (!coordination.value.accepted) {
      return fail(new Error('coordination-rejected')); 
    }

    const orchestration = await this.planOrchestrator.createPlan({
      program,
      runState,
      requestedBy: context.requestedBy,
      correlationId: context.correlationId,
      candidateBudget: 3,
    });
    if (!orchestration.ok) {
      return fail(orchestration.error);
    }

    if (orchestration.value.shouldAbort) {
      runState.status = 'aborted';
      runState.completedAt = new Date().toISOString();
      await this.options.runRepository.setRun(runState);
      await this.options.notifier.publishRunState(runState);
      return fail(new Error('orchestration-blocked-by-policies-or-risk'));
    }

    const assessment = await this.policyEngine.assessProgram(program, runState);
    if (!assessment.ok) {
      return fail(assessment.error);
    }

    if (assessment.value.compliance.blocked) {
      runState.status = 'aborted';
      runState.completedAt = new Date().toISOString();
      await this.options.runRepository.setRun(runState);
      await this.options.notifier.publishRunState(runState);
      return fail(new Error('recovery-blocked-by-policy'));
    }

    const policyRisk = await this.riskEngine.evaluate({
      runId: runState.runId as unknown as RiskRunId,
      program,
      runState,
      tenant: program.tenant,
      policies: await this.options.policyRepository?.activePolicies(program.tenant) ?? [],
      signals: this.buildSignals(program, context),
    });

    if (!policyRisk.ok) {
      return fail(policyRisk.error);
    }

    if (policyRisk.value.shouldAbort) {
      runState.status = 'aborted';
      runState.completedAt = new Date().toISOString();
      await this.options.runRepository.setRun(runState);
      await this.options.notifier.publishRunState(runState);
      return fail(new Error('risk-blocked-run'));
    }

    if (assessment.value.compliance.throttleMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, Math.min(assessment.value.compliance.throttleMs, 5));
      });
    }

    const schedule = scheduleProgram(runState, program);
    const candidateStepIds = new Set(orchestration.value.executionSequence.map((step: RecoveryStep) => step.id));
    const orderedSteps = program.steps.filter((step) => candidateStepIds.has(step.id));
    const plan = buildExecutionPlan({
      runId: runState.runId,
      program,
      includeFallbacks: true,
    });
    runState.estimatedRecoveryTimeMinutes = Math.max(
      schedule.predictedDurationMinutes,
      orchestration.value.estimatedDurationMinutes,
      plan.estimatedMinutes,
    );

    const simulation = simulateRun(program, runState);
    const suggestions = await this.advisor.latestSuggestion();
    if (this.shouldAbortBySimulation(simulation, suggestions) || policyRisk.value.shouldDefer) {
      runState.status = 'aborted';
      runState.completedAt = new Date().toISOString();
      await this.options.runRepository.setRun(runState);
      const artifact = this.createArtifact(runState, program);
      await this.options.artifactRepository.save(artifact);
      await this.options.notifier.publishRunState(runState);
      return fail(new Error('simulation-risk-too-high'));
    }

    if (shouldThrottle(runState)) {
      return fail(new Error('run-throttled'));
    }

    await this.options.runRepository.setRun(runState);
    await this.options.artifactRepository.save(this.createArtifact(runState, program));
    await this.options.notifier.publishRunState(runState);

    const order = topologicalOrder(program);
    const steps = orderedSteps.length ? orderedSteps : program.steps.filter((step) => order.includes(step.id));
    return this.executor.run(program, runState, steps);
  }

  async reviewRecentProgress(runId: RecoveryRunId): Promise<Result<boolean, Error>> {
    const run = await this.options.runRepository.getRun(runId);
    if (!run) return fail(new Error('run-missing'));
    const checkpoints = (await this.options.artifactRepository.queryArtifacts({ runId }))
      .map((artifact) => artifact.checkpoint)
      .filter((checkpoint): checkpoint is RecoveryCheckpoint => Boolean(checkpoint));
    return ok(isRunRecoverable(run, checkpoints));
  }

  async closeRun(runId: RecoveryRunId): Promise<Result<string, Error>> {
    const run = await this.options.runRepository.getRun(runId);
    if (!run) return fail(new Error('run-not-found'));
    run.status = 'aborted';
    run.completedAt = new Date().toISOString();
    await this.options.runRepository.setRun(run);
    return ok(`run ${runId} closed`);
  }

  private shouldAbortBySimulation(
    simulation: ReturnType<typeof simulateRun>,
    suggestions: readonly RecoverySuggestion[],
  ): boolean {
    if (simulation.successProbability < 0.15) return true;
    if (simulation.orderedSteps.length === 0) return true;
    if (suggestions.length > 0 && simulation.expectedDurationMinutes > 120) return true;
    return false;
  }

  private buildSignals(program: RecoveryProgram, context: RecoveryCommandContext) {
    return program.steps.map((step, index) => ({
      id: `${step.id}-signal` as RiskSignal['id'],
      runId: `${program.id}:${context.correlationId}` as RiskSignal['runId'],
      source: 'sre' as const,
      observedAt: new Date().toISOString(),
      metricName: step.command,
      dimension: this.getSignalDimensions()[index % 5],
      value: (step.requiredApprovals + index + 1) / (program.steps.length + 1),
      weight: 0.8,
      tags: ['derived', 'plan-step'],
      context: { stepId: step.id, requestedBy: context.requestedBy },
    }));
  }

  private getSignalDimensions(): readonly RiskDimension[] {
    return ['blastRadius', 'recoveryLatency', 'dataLoss', 'dependencyCoupling', 'compliance'];
  }

  private async runSimulation(
    program: RecoveryProgram,
    context: RecoveryCommandContext,
    runState: RecoveryRunState,
  ): Promise<Result<SimulationSummary, Error>> {
    const simulationProfileId = `${runState.runId}:${program.id}` as RecoverySimulationId;
    const simulationProfile = parseSimulationProfile({
      id: simulationProfileId,
      scenario: {
        id: `${program.id}:scenario`,
        tenant: `${program.tenant}`,
        owner: context.requestedBy,
        title: `${program.name} simulation`,
        window: {
          startAt: runState.startedAt ?? new Date().toISOString(),
          endAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          timezone: 'UTC',
        },
        steps: program.steps.map((step) => ({
          id: step.id,
          phase: 'recovery',
          title: step.title,
          command: step.command,
          expectedMinutes: Math.max(1, Math.round(step.timeoutMs / 60000)),
          dependencies: step.dependencies,
          constraints: [],
        })),
        rules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      runId: runState.runId as string,
      region: 'global',
      blastRadiusScore: 0.3,
      targetRtoMinutes: 15,
      targetRpoMinutes: 1,
      concurrencyCap: Math.max(1, Math.min(4, program.steps.length)),
    });

    const input: SimulationInput = {
      profile: simulationProfile,
      now: new Date().toISOString(),
      dryRun: context.correlationId.endsWith('-dry'),
    };
    const simulationRun = runAndEmitSimulationEvents(input);
    if (!simulationRun.ok) {
      return { ok: false, error: simulationRun.error };
    }
    return { ok: true, value: simulationRun.value.summary };
  }

  private logSimulationHint(runId: string, summary: SimulationSummary) {
    void Promise.resolve(summary.score).then((score) => {
      if (score < 40) {
        const artifact: RecoveryArtifact = {
          id: `${runId}` as RecoveryArtifact['id'],
          runId: runId as RecoveryArtifact['runId'],
          eventId: `${runId}:${summary.id}` as RecoveryArtifact['eventId'],
          recordedAt: new Date().toISOString(),
          run: undefined as unknown as RecoveryRunState,
          program: undefined as unknown as RecoveryProgram,
          checkpoint: undefined,
        };
        void artifact;
      }
    });
  }

  private createArtifact(runState: RecoveryRunState, program: RecoveryProgram): RecoveryArtifact {
    return {
      id: `${runState.runId}` as RecoveryArtifact['id'],
      runId: runState.runId,
      eventId: `${Date.now()}` as RecoveryArtifact['eventId'],
      recordedAt: new Date().toISOString(),
      run: runState,
      program,
      checkpoint: undefined,
    };
  }
}
