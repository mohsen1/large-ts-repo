import { withBrand } from '@shared/core';
import { parseRuntimeState } from './schema';
import type {
  AdapterMessage,
  CommandIntent,
  CommandRun,
  CommandSequence,
  CommandStudioWorkspaceId,
  SequenceIntentMap,
  StudioRuntimeState,
} from './types';

const mapMessage = (input: unknown): { eventType: string; data: unknown; trace: string[] } => {
  const cast = input as { eventType?: unknown; data?: unknown; trace?: unknown };
  if (typeof cast !== 'object' || cast === null) {
    throw new Error('Invalid adapter payload');
  }

  if (typeof cast.eventType !== 'string') {
    throw new Error('Invalid eventType');
  }

  if (!Array.isArray(cast.trace)) {
    throw new Error('Invalid trace');
  }

  return {
    eventType: cast.eventType,
    data: cast.data,
    trace: cast.trace as string[],
  };
};

export const deserializeRuntime = (payload: unknown): StudioRuntimeState => {
  return parseRuntimeState(payload);
};

export const toAdapterMessage = <TPayload>(
  eventType: string,
  data: TPayload,
  trace: readonly string[] = [],
): AdapterMessage<TPayload> => ({
  id: withBrand(`${eventType}-${Date.now()}`, 'AdapterMessageId'),
  eventType,
  data,
  trace,
});

export const parseAdapterMessage = (payload: unknown): AdapterMessage<unknown> => {
  const parsed = mapMessage(payload);
  return toAdapterMessage(parsed.eventType, parsed.data, parsed.trace);
};

export const attachWorkspacePrefix = (workspaceId: CommandStudioWorkspaceId, input: string): string => `${workspaceId}::${input}`;

export const buildIntentMap = (
  sequenceId: CommandStudioWorkspaceId,
  intents: readonly CommandIntent[],
): SequenceIntentMap => ({
  sequenceId,
  mapping: intents.reduce((acc, intent) => {
    const existing = acc.find((entry) => entry.commandId === intent.commandId);
    if (existing) {
      existing.intentIds.push(intent.intentId);
      return acc;
    }

    acc.push({
      commandId: intent.commandId,
      intentIds: [intent.intentId],
    });
    return acc;
  }, [] as { commandId: CommandIntent['commandId']; intentIds: CommandIntent['intentId'][] }[]),
});

const isTerminalRun = (run: CommandRun): boolean => run.state === 'complete' || run.state === 'failed';

export const summarizeByWorkspace = (state: StudioRuntimeState) =>
  state.runs.reduce(
    (acc, run) => {
      const value = acc.get(run.workspaceId) ?? { totalRuns: 0, activeRuns: 0, terminalRuns: 0 };
      value.totalRuns += 1;
      value.activeRuns += run.state === 'active' ? 1 : 0;
      value.terminalRuns += isTerminalRun(run) ? 1 : 0;
      acc.set(run.workspaceId, value);
      return acc;
    },
    new Map<string, { totalRuns: number; activeRuns: number; terminalRuns: number }>(),
  );
