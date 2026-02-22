import { Brand } from '@shared/core';
import { AppError } from '@shared/errors';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LoggerNamespace = Brand<string, 'LoggerNamespace'>;

export interface LogContext {
  traceId?: Brand<string, 'TraceId'>;
  spanId?: Brand<string, 'SpanId'>;
  requestId?: Brand<string, 'RequestId'>;
  [key: string]: unknown;
}

export interface LogEvent {
  level: LogLevel;
  namespace: LoggerNamespace;
  message: string;
  context?: LogContext;
  error?: Error;
  createdAt: string;
}

export interface LoggerSink {
  emit(event: LogEvent): void | Promise<void>;
}

export class InMemorySink implements LoggerSink {
  private events: LogEvent[] = [];
  emit(event: LogEvent) {
    this.events.push(event);
  }
  read(): readonly LogEvent[] {
    return this.events;
  }
  clear() {
    this.events = [];
  }
}

export const defaultNamespace = 'system' as LoggerNamespace;

export class Logger {
  private readonly namespace: LoggerNamespace;
  private sinks: LoggerSink[] = [];

  constructor(namespace: LoggerNamespace = defaultNamespace, sinks: LoggerSink[] = [new InMemorySink()]) {
    this.namespace = namespace;
    this.sinks = sinks;
  }

  withSink(sink: LoggerSink): this {
    this.sinks = [...this.sinks, sink];
    return this;
  }

  debug(message: string, context?: LogContext): void { this.emit('debug', message, context); }
  info(message: string, context?: LogContext): void { this.emit('info', message, context); }
  warn(message: string, context?: LogContext): void { this.emit('warn', message, context); }
  error(message: string, error?: AppError | Error, context?: LogContext): void { this.emit('error', message, context, error); }

  private emit(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const event: LogEvent = {
      level,
      namespace: this.namespace,
      message,
      context,
      error,
      createdAt: new Date().toISOString(),
    };
    for (const sink of this.sinks) sink.emit(event);
  }
}
