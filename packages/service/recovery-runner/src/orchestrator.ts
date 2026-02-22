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
} from '@domain/recovery-orchestration';
import {
  type RecoveryArtifactRepository,
  type RecoveryRunRepository,
} from '@data/recovery-artifacts';
import type { RecoveryArtifact } from '@data/recovery-artifacts';
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
import { RecoveryRiskEngine, type RiskEngineDependencies, type RunRiskContext } from '@service/recovery-risk-engine';

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
}

const defaultStepExecutor = async () => 0;

export class RecoveryOrchestrator {
  private readonly executor: RecoveryExecutor;
  private readonly policyEngine: PolicyEngine;
  private readonly advisor: RecoveryAdvisor;
  private readonly riskEngine: RecoveryRiskEngine;

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
  }

  async initiateRecovery(program: RecoveryProgram, context: RecoveryCommandContext): Promise<Result<RecoveryRunState, Error>> {
    const runState = createRecoveryRunState({
      runId: `${program.id}:${context.correlationId}`,
      programId: program.id,
      incidentId: `${context.correlationId}:${context.requestedBy}`,
      estimatedRecoveryTimeMinutes: 15,
    });

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
      runId: runState.runId,
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
    const plan = buildExecutionPlan({
      runId: runState.runId,
      program,
      includeFallbacks: true,
    });
    runState.estimatedRecoveryTimeMinutes = Math.max(schedule.predictedDurationMinutes, plan.estimatedMinutes);

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
    const steps = program.steps.filter((step) => order.includes(step.id));
    return this.executor.run(program, runState, steps);
  }

  async reviewRecentProgress(runId: RecoveryRunId): Promise<Result<boolean, Error>> {
    const run = await this.options.runRepository.getRun(runId);
    if (!run) return fail(new Error('run-missing'));
    const checkpoints = (await this.options.artifactRepository.queryArtifacts({ runId }))
      .map((artifact) => artifact.checkpoint)
      .filter(Boolean) as RecoveryArtifact[];
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
      id: `${step.id}-signal` as never,
      runId: `${program.id}:${context.correlationId}` as never,
      source: 'sre' as const,
      observedAt: new Date().toISOString(),
      metricName: step.command,
      dimension: ['blastRadius', 'recoveryLatency', 'dataLoss', 'dependencyCoupling', 'compliance'][index % 5] as never,
      value: (step.requiredApprovals + index + 1) / (program.steps.length + 1),
      weight: 0.8,
      tags: ['derived', 'plan-step'],
      context: { stepId: step.id, requestedBy: context.requestedBy },
    }));
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
