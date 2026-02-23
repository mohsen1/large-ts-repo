import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { RecoveryCoordinationOrchestrator } from './orchestrator';
import { asCorrelation, asRun } from '@domain/recovery-coordination';
import type {
  CoordinationAttemptInput,
  CoordinationAttemptReport,
  CoordinationCommandContext,
} from './types';

export interface CommandCenterOptions {
  readonly orchestrator: RecoveryCoordinationOrchestrator;
}

export interface CommandCenterInput {
  readonly tenant: string;
  readonly commandId: string;
  readonly operator: string;
  readonly runId: string;
  readonly requestedBy: string;
  readonly runWindowMinutes: number;
}

export interface CommandCenterState {
  readonly commandId: string;
  readonly tenant: string;
  readonly correlationId: string;
  readonly running: boolean;
  readonly canCancel: boolean;
  readonly canRetry: boolean;
}

export interface CommandCenterHistory {
  readonly commandId: string;
  readonly executedAt: string;
  readonly accepted: boolean;
  readonly runId: string;
  readonly state: CoordinationAttemptReport['state'];
}

export class RecoveryCoordinationCommandCenter {
  private readonly orchestrator: RecoveryCoordinationOrchestrator;
  private readonly inFlight = new Map<string, CoordinationAttemptReport>();

  constructor(options: CommandCenterOptions) {
    this.orchestrator = options.orchestrator;
  }

  async execute(input: CommandCenterInput, attemptInput: CoordinationAttemptInput): Promise<Result<CoordinationAttemptReport, Error>> {
    const prepared = this.prepareInput(input, attemptInput);
    const report = await this.orchestrator.coordinate(prepared);
    if (!report.ok) {
      return fail(report.error);
    }

    this.inFlight.set(input.commandId, report.value);
    return ok(report.value);
  }

  async cancel(commandId: string): Promise<Result<boolean, Error>> {
    const running = this.inFlight.get(commandId);
    if (!running) {
      return fail(new Error('command-not-found'));
    }

    this.inFlight.delete(commandId);
    return ok(running.state.phase !== 'complete');
  }

  async status(commandId: string): Promise<Result<CommandCenterState, Error>> {
    const running = this.inFlight.get(commandId);
    if (!running) {
      return fail(new Error('command-not-found'));
    }

    return ok({
      commandId,
      tenant: running.tenant,
      correlationId: running.correlationId,
      running: running.state.phase !== 'complete',
      canCancel: running.state.phase !== 'complete',
      canRetry: running.state.phase === 'complete',
    });
  }

  async history(commandId: string): Promise<Result<CommandCenterHistory, Error>> {
    const running = this.inFlight.get(commandId);
    if (!running) {
      return fail(new Error('command-not-found'));
    }

    return ok({
      commandId,
      executedAt: running.state.startedAt,
      accepted: running.accepted,
      runId: running.runId,
      state: running.state,
    });
  }

  private prepareInput(input: CommandCenterInput, attemptInput: CoordinationAttemptInput): CoordinationAttemptInput {
    const context: CoordinationCommandContext = {
      requestedBy: input.operator,
      tenant: input.tenant,
      correlationId: asCorrelation(createCorrelation(input.commandId)),
    };

    return {
      ...attemptInput,
      runId: asRun(input.runId),
      commandId: input.commandId,
      tenant: input.tenant,
      context,
      budget: {
        maxStepCount: 1 + Math.floor(input.runWindowMinutes / 15),
        maxParallelism: Math.max(1, Math.floor(input.runWindowMinutes / 30)),
        maxRuntimeMinutes: Math.max(1, input.runWindowMinutes),
      },
    };
  }
}

const createCorrelation = (value: string): string => `${value}:${Date.now()}`;
