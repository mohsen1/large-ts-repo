import type { CommandIntentEnvelope } from '@domain/recovery-command-language';

export interface ObserverCursor {
  lastOffset: number;
  labels: string[];
}

export interface CommandSignal {
  key: string;
  intent: CommandIntentEnvelope;
  receivedAt: number;
  severity: 'info' | 'warn' | 'error';
}

export function toSignal(intent: CommandIntentEnvelope, severity: CommandSignal['severity']): CommandSignal {
  return {
    key: `signal-${intent.id}`,
    intent,
    receivedAt: Date.now(),
    severity,
  };
}

export function updateCursor(cursor: ObserverCursor, key: string): ObserverCursor {
  return {
    lastOffset: cursor.lastOffset + 1,
    labels: [...cursor.labels, key],
  };
}
