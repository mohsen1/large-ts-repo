import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

import {
  createRecoveryRunState,
  isRunRecoverable,
  type RecoveryProgram,
  topologicalOrder,
  type RecoveryCheckpoint,
  type RecoveryRunId,
  type RecoveryRunState,
} from '@domain/recovery-orchestration';
import {
  type RecoveryArtifactRepository,
  type RecoveryRunRepository,
} from '@data/recovery-artifacts';
import { type RecoveryArtifact } from '@data/recovery-artifacts';
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
}

const defaultStepExecutor = async () => 0;

export class RecoveryOrchestrator {
  private readonly executor: RecoveryExecutor;

  constructor(private readonly options: RecoveryRunnerOptions) {
    this.executor = new RecoveryExecutor(
      this.options.runRepository,
      this.options.artifactRepository,
      this.options.notifier,
      defaultStepExecutor
    );
  }

  async initiateRecovery(program: RecoveryProgram, context: RecoveryCommandContext): Promise<Result<RecoveryRunState, Error>> {
    const runState = createRecoveryRunState({
      runId: `${program.id}:${context.correlationId}`,
      programId: program.id,
      incidentId: `${context.correlationId}:${context.requestedBy}`,
      estimatedRecoveryTimeMinutes: scheduleProgram(
        createRecoveryRunState({
          runId: `${program.id}:${context.correlationId}`,
          programId: program.id,
          incidentId: `${context.correlationId}:${context.requestedBy}`,
          estimatedRecoveryTimeMinutes: 10,
        }),
        program
      ).predictedDurationMinutes,
    });

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
    const checkpoints = (await this.options.artifactRepository.queryArtifacts({ runId })).map((artifact) => artifact.checkpoint).filter(Boolean) as RecoveryCheckpoint[];
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
      id: `${runState.runId}` as any,
      runId: runState.runId,
      eventId: `${Date.now()}` as any,
      recordedAt: new Date().toISOString(),
      run: runState,
      program,
      checkpoint: undefined,
    };
  }
}
