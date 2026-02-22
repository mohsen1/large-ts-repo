import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

import type {
  RecoveryProgram,
  RecoveryRunState,
  RecoveryStep,
} from '@domain/recovery-orchestration';
import type {
  RecoveryArtifact,
  RecoveryArtifactRepository,
  RecoveryRunRepository,
} from '@data/recovery-artifacts';
import type { RecoveryNotifier } from '@infrastructure/recovery-notifications';

import { encodeArtifact } from '@data/recovery-artifacts';
import { pickWindow } from './scheduler';

type StepExecution = (step: RecoveryStep) => Promise<number>;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.min(ms, 2)));

export class RecoveryExecutor {
  constructor(
    private readonly runRepository: RecoveryRunRepository,
    private readonly artifactRepository: RecoveryArtifactRepository,
    private readonly notifier: RecoveryNotifier,
    private readonly executeStep: StepExecution
  ) {}

  async run(
    program: RecoveryProgram,
    run: RecoveryRunState,
    steps: readonly RecoveryStep[]
  ): Promise<Result<RecoveryRunState, Error>> {
    run.status = 'running';
    run.startedAt = new Date().toISOString();
    await this.runRepository.setRun(run);
    await this.notifier.publishRunState(run);

    try {
      for (const step of steps) {
        run.currentStepId = step.id;
        const window = pickWindow(run);
        const checkpointId = `${run.runId}:${step.id}` as any;
        const start = Date.now();
        const code = await this.executeStep(step);
        const completedAt = new Date().toISOString();
        const checkpoint = {
          id: checkpointId,
          runId: run.runId,
          stepId: step.id,
          status: code === 0 ? 'completed' : 'failed',
          exitCode: code,
          createdAt: completedAt,
          message: code === 0 ? 'success' : 'non-zero exit',
          details: { command: step.command, window },
        };

        run.currentStepId = undefined;
        run.nextStepId = undefined;
        run.estimatedRecoveryTimeMinutes = Math.max(0, run.estimatedRecoveryTimeMinutes - Math.ceil((Date.now() - start) / 60000));
        await this.artifactRepository.save({
          id: `${run.runId}:${step.id}` as any,
          runId: run.runId,
          eventId: `${run.runId}` as any,
          recordedAt: completedAt,
          run,
          program,
          checkpoint,
        } satisfies RecoveryArtifact);
        const artifact = await this.artifactRepository.findByRunId(run.runId);
        if (artifact) {
          await this.notifier.publishCheckpointUpdate(encodeArtifact(artifact));
        }
        if (code !== 0) {
          run.status = 'failed';
          break;
        }
        await wait(1);
      }

      if (run.status !== 'failed') {
        run.status = 'completed';
        run.completedAt = new Date().toISOString();
        await this.runRepository.setRun(run);
      }
      await this.notifier.publishRunState(run);
      return ok(run);
    } catch (error) {
      run.status = 'aborted';
      run.completedAt = new Date().toISOString();
      await this.runRepository.setRun(run);
      await this.notifier.publishRunState(run);
      return fail(error as Error);
    }
  }
}
