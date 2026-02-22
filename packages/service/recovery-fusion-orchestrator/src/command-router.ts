import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { FusionPlanCommand, FusionWave } from '@domain/recovery-fusion-intelligence';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { FusionContext, FusionLifecycleEvent, FusionStore } from './types';

export type CommandResult = {
  readonly command: FusionPlanCommand['command'];
  readonly waveId: FusionPlanCommand['targetWaveId'];
  readonly waveState: FusionWave['state'];
  readonly approved: boolean;
};

export interface CommandEnvelope {
  readonly runId: RecoveryRunState['runId'];
  readonly waveId: FusionPlanCommand['targetWaveId'];
  readonly command: FusionPlanCommand['command'];
  readonly reason: string;
}

interface CommandHandler {
  readonly canHandle: (command: FusionPlanCommand['command'], wave: FusionWave) => boolean;
  readonly execute: (wave: FusionWave, command: FusionPlanCommand) => CommandResult;
}

const isIdle = (wave: FusionWave): boolean => wave.state === 'idle' || wave.state === 'warming';
const isRunning = (wave: FusionWave): boolean => wave.state === 'running';
const isBlocked = (wave: FusionWave): boolean => wave.state === 'blocked';

const handlers: Record<FusionPlanCommand['command'], CommandHandler> = {
  start: {
    canHandle: (_command, wave) => isIdle(wave),
    execute: (wave, command) => ({ command: command.command, waveId: command.targetWaveId, waveState: wave.state, approved: isIdle(wave) }),
  },
  pause: {
    canHandle: (_command, wave) => isRunning(wave),
    execute: (wave, command) => ({ command: command.command, waveId: command.targetWaveId, waveState: wave.state, approved: isRunning(wave) }),
  },
  resume: {
    canHandle: (_command, wave) => isBlocked(wave),
    execute: (wave, command) => ({ command: command.command, waveId: command.targetWaveId, waveState: wave.state, approved: isBlocked(wave) }),
  },
  abort: {
    canHandle: (_command, wave) => wave.state !== 'idle',
    execute: (wave, command) => ({ command: command.command, waveId: command.targetWaveId, waveState: wave.state, approved: wave.state !== 'idle' }),
  },
};

const parseCommand = (command: FusionPlanCommand): Result<CommandEnvelope, string> => {
  if (!command.targetWaveId || !command.command) {
    return fail('invalid-command');
  }
  return ok({
    runId: command.runId,
    waveId: command.targetWaveId,
    command: command.command,
    reason: command.reason,
  });
};

export const canRunCommand = (command: FusionPlanCommand, waves: readonly FusionWave[]): Result<CommandResult, string> => {
  const envelope = parseCommand(command);
  if (!envelope.ok) {
    return fail(envelope.error);
  }

  const wave = waves.find((entry) => entry.id === envelope.value.waveId);
  if (!wave) {
    return fail(`missing-wave:${envelope.value.waveId}`);
  }

  const handler = handlers[envelope.value.command];
  if (!handler.canHandle(envelope.value.command, wave)) {
    return fail(`command-not-allowed:${wave.state}`);
  }

  return ok(handler.execute(wave, command));
};

const toEventType = (command: FusionPlanCommand['command']): FusionLifecycleEvent['eventType'] => {
  if (command === 'abort') return 'bundle_closed';
  if (command === 'pause' || command === 'resume') return 'wave_completed';
  return 'wave_started';
};

export const buildCommandEvent = (command: CommandEnvelope, context: FusionContext): FusionLifecycleEvent => {
  return {
    eventId: `fusion:cmd:${context.planIdPrefix}:${command.waveId}:${command.command}`,
    eventType: toEventType(command.command),
    tenant: context.tenant,
    bundleId: `${context.planIdPrefix}:${command.waveId}` as any,
    occurredAt: new Date().toISOString(),
    payload: {
      command: command.command,
      reason: command.reason,
      runId: String(command.runId),
    },
  };
};

export const routeCommand = async (
  store: FusionStore,
  bus: { send(payload: unknown): Promise<Result<void, string>> },
  context: FusionContext,
  command: FusionPlanCommand,
): Promise<Result<boolean, Error>> => {
  const waves = (await store.list(command.runId)).flatMap((bundle) => bundle.waves);
  const validation = canRunCommand(command, waves);
  if (!validation.ok) {
    return fail(new Error(validation.error));
  }

  const envelopeResult = parseCommand(command);
  if (!envelopeResult.ok) {
    return fail(new Error(envelopeResult.error));
  }

  const event = buildCommandEvent(envelopeResult.value, context);
  const sent = await bus.send(event);
  if (!sent.ok) {
    return fail(new Error(String(sent.error)));
  }
  return ok(true);
};
