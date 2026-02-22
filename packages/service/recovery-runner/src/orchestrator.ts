import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

import {
  createRecoveryRunState,
  isRunRecoverable,
  topologicalOrder,
  type RecoveryCheckpoint,
  type RecoveryProgram,
  type RecoveryRunId,
  type RecoveryRunState,
} from '@domain/recovery-orchestration';
import {
  type RecoveryArtifactRepository,
  type RecoveryRunRepository,
} from '@data/recovery-artifacts';
import { type RecoveryArtifact } from '@data/recovery-artifacts';
import { type InMemoryRecoveryPolicyRepository, type RecoveryPolicyRepository } from '@data/recovery-policy-store';
import { RecoveryPolicyEngine } from '@service/recovery-policy-engine';
import type { RecoveryPolicyEngine as PolicyEngine } from '@service/recovery-policy-engine';
import type { RecoveryNotifier } from '@infrastructure/recovery-notifications';
import { RecoveryExecutor } from './executor';
import { scheduleProgram, shouldThrottle } from './scheduler';

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
}

const defaultStepExecutor = async () => 0;

export class RecoveryOrchestrator {
  private readonly executor: RecoveryExecutor;
  private readonly policyEngine: PolicyEngine;

  constructor(private readonly options: RecoveryRunnerOptions) {
    this.executor = new RecoveryExecutor(
      this.options.runRepository,
      this.options.artifactRepository,
      this.options.notifier,
      defaultStepExecutor,
    );

    const repository = this.options.policyRepository ?? new InMemoryRecoveryPolicyRepository();
    this.policyEngine = this.options.policyEngine ?? new RecoveryPolicyEngine(repository);
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

    if (assessment.value.compliance.throttleMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, Math.min(assessment.value.compliance.throttleMs, 5));
      });
    }

    const schedule = scheduleProgram(
      runState,
      program,
    );
    runState.estimatedRecoveryTimeMinutes = schedule.predictedDurationMinutes;

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
      .filter(Boolean) as RecoveryCheckpoint[];
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
