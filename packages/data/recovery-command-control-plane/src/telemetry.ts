import type { CommandIntent, CommandDirective } from '@domain/recovery-command-language';

export interface EventEnvelope<T = unknown> {
  stream: string;
  at: number;
  payload: T;
}

export interface CommandControlTelemetry {
  events: EventEnvelope[];
  version: number;
}

export function emitIntentEvent(
  intent: CommandIntent,
  directives: CommandDirective[],
): EventEnvelope[] {
  const now = Date.now();
  return [
    {
      stream: 'command.intent',
      at: now,
      payload: {
        intentId: intent.id,
        intentLabel: intent.label,
        directiveCount: directives.length,
      },
    },
  ];
}

export function emitDirectiveEvent(directive: CommandDirective, streamSuffix = 'command.directive'): EventEnvelope {
  return {
    stream: streamSuffix,
    at: Date.now(),
    payload: {
      intentId: directive.commandIntentId,
      kind: directive.kind,
      channel: directive.channel,
      actor: directive.actor,
    },
  };
}

export function appendEvents(telemetry: CommandControlTelemetry, events: EventEnvelope[]): CommandControlTelemetry {
  return {
    ...telemetry,
    events: [...telemetry.events, ...events],
  };
}

export function buildTelemetry(intentCount: number): CommandControlTelemetry {
  return {
    events: [],
    version: 1,
  };
}
