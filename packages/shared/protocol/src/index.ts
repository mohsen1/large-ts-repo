import { Brand, PageResult } from '@shared/core';

export type MessageId = Brand<string, 'MessageId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

export interface Envelope<TPayload, TMeta = Record<string, unknown>> {
  id: MessageId;
  correlationId: CorrelationId;
  timestamp: string;
  eventType: string;
  payload: TPayload;
  metadata?: TMeta;
}

export type EventName<T extends string = string> = Brand<T, 'EventName'>;

export interface EventEnvelope<TPayload = unknown, TName extends string = string> extends Envelope<TPayload> {
  eventType: EventName<TName>;
  version: number;
}

export interface CommandEnvelope<TPayload = unknown, TName extends string = string> extends Envelope<TPayload> {
  command: EventName<TName>;
  replyTo?: string;
}

export interface BusMessage<TBody> {
  body: TBody;
  ack: () => void;
  nack: (error?: Error) => void;
}

export interface PagedResponse<T> extends PageResult<T> {
  pageSize: number;
}

export const createEnvelope = <T>(eventType: string, payload: T): Envelope<T> => {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}` as MessageId,
    correlationId: `${Date.now()}` as CorrelationId,
    timestamp: new Date().toISOString(),
    eventType,
    payload,
  };
};

export const withCorrelation = <T>(env: Envelope<T>, correlationId: CorrelationId): Envelope<T> => ({
  ...env,
  correlationId,
});

export const isExpired = (env: Envelope<unknown>): boolean => {
  const age = Date.now() - Date.parse(env.timestamp);
  return Number.isNaN(age) ? false : age > 24 * 60 * 60 * 1000;
};

export const serialize = <T>(env: Envelope<T>): string => JSON.stringify(env);

export const deserialize = <T>(raw: string): Envelope<T> => {
  return JSON.parse(raw) as Envelope<T>;
};
