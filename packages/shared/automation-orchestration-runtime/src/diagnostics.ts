import type { Brand } from '@shared/type-level';

export type DiagnosticLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type DiagnosticCode = Brand<string, 'DiagnosticCode'>;
export type AuditEvent = `audit:${string}`;

export interface DiagnosticMessage {
  readonly level: DiagnosticLevel;
  readonly code: DiagnosticCode;
  readonly detail: string;
  readonly at: string;
  readonly tags: readonly string[];
}

export interface DiagnosticEnvelope<TContext = unknown> {
  readonly event: AuditEvent;
  readonly eventAt: string;
  readonly context: TContext;
  readonly messages: readonly DiagnosticMessage[];
}

export interface DiagnosticsReport<TContext = unknown> {
  readonly runId: Brand<string, 'RunId'>;
  readonly summary: string;
  readonly level: DiagnosticLevel;
  readonly envelopes: readonly DiagnosticEnvelope<TContext>[];
}

export type FlatContext<TContext> = TContext & {
  readonly nested: {
    readonly level: DiagnosticLevel;
    readonly path: readonly string[];
  };
};

type KeyedMessages<T extends readonly string[]> = {
  [Index in T[number]]: readonly DiagnosticMessage[];
};

type AsyncDisposableStackLike = {
  disposeAsync(): Promise<void>;
  defer(callback: () => void | Promise<void>): void;
};

const resolveAsyncDisposableStack = (): (new () => AsyncDisposableStackLike) | undefined => {
  const candidate = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableStackLike }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }
  return undefined;
};

class FallbackAsyncDisposableStack implements AsyncDisposableStackLike {
  readonly #callbacks: Array<() => void | Promise<void>> = [];

  public defer(callback: () => void | Promise<void>): void {
    this.#callbacks.push(callback);
  }

  public async disposeAsync(): Promise<void> {
    for (let index = this.#callbacks.length - 1; index >= 0; index -= 1) {
      await this.#callbacks[index]();
    }
    this.#callbacks.length = 0;
  }
}

const createAsyncDisposableStack = (): AsyncDisposableStackLike => {
  const ctor = resolveAsyncDisposableStack();
  return ctor ? new ctor() : new FallbackAsyncDisposableStack();
};

const toAuditEvent = <TEvent extends string>(event: TEvent): AuditEvent => `audit:${event}` as AuditEvent;

export class DiagnosticsBus<TContext = unknown> {
  readonly #events: DiagnosticEnvelope<TContext>[] = [];
  readonly #stack: AsyncDisposableStackLike;

  public constructor(public readonly runId: Brand<string, 'RunId'>) {
    this.#stack = createAsyncDisposableStack();
  }

  public add(level: DiagnosticLevel, code: string, detail: string, context: TContext): void {
    this.#events.push({
      event: toAuditEvent(code),
      eventAt: new Date().toISOString(),
      context,
      messages: [
        {
          level,
          code: code as DiagnosticCode,
          detail,
          at: new Date().toISOString(),
          tags: [level, 'bus'],
        },
      ],
    });
  }

  public withScope(scope: string, context: TContext): DiagnosticsScope<TContext> {
    return new DiagnosticsScope(scope, context, this.#events);
  }

  public summary(): DiagnosticsReport<TContext> {
    const topLevel = deriveLevel(this.#events.flatMap((envelope) => envelope.messages.map((message) => message.level)));
    return {
      runId: this.runId,
      summary: `${this.#events.length} diagnostic events captured`,
      level: topLevel,
      envelopes: this.#events,
    };
  }

  public async close(reason = 'manual'): Promise<void> {
    await this.#stack.disposeAsync();
    this.add('info', `diagnostics.close`, `scope closed: ${reason}`, this.#events.at(-1)?.context as TContext);
  }

  private groupByLevel(): { [K in DiagnosticLevel]: number } {
    const buckets = {
      trace: 0,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    for (const envelope of this.#events) {
      for (const message of envelope.messages) {
        buckets[message.level] += 1;
      }
    }
    return buckets;
  }
}

export class DiagnosticsScope<TContext> {
  readonly #events: DiagnosticEnvelope<TContext>[];
  readonly #scope: string;
  readonly #context: TContext;

  public constructor(scope: string, context: TContext, events: DiagnosticEnvelope<TContext>[]) {
    this.#scope = scope;
    this.#context = context;
    this.#events = events;
    this.#events.push({
      event: toAuditEvent(`scope.open:${scope}`),
      eventAt: new Date().toISOString(),
      context,
      messages: [
        {
          level: 'info',
          code: `scope.open.${scope}` as DiagnosticCode,
          detail: 'scope initialized',
          at: new Date().toISOString(),
          tags: [scope, 'open'],
        },
      ],
    });
  }

  public add(level: DiagnosticLevel, code: string, detail: string): void {
    this.#events.push({
      event: toAuditEvent(code),
      eventAt: new Date().toISOString(),
      context: this.#context,
      messages: [
        {
          level,
          code: code as DiagnosticCode,
          detail,
          at: new Date().toISOString(),
          tags: [code, this.#scope],
        },
      ],
    });
  }

  public [Symbol.dispose](): void {
    this.#events.push({
      event: toAuditEvent(`scope.close:${this.#scope}`),
      eventAt: new Date().toISOString(),
      context: this.#context,
      messages: [
        {
          level: 'info',
          code: `scope.close.${this.#scope}` as DiagnosticCode,
          detail: 'scope disposed',
          at: new Date().toISOString(),
          tags: [this.#scope, 'close'],
        },
      ],
    });
  }
}

export const diagnosticsReport = <TContext>(
  runId: Brand<string, 'RunId'>,
  events: readonly DiagnosticEnvelope<TContext>[],
): DiagnosticsReport<TContext> => {
  return {
    runId,
    summary: `${events.length} event(s)`,
    level: deriveLevel(events.flatMap((event) => event.messages.map((message) => message.level))),
    envelopes: [...events],
  };
};

const deriveLevel = (levels: readonly DiagnosticLevel[]): DiagnosticLevel =>
  levels.includes('error')
    ? 'error'
    : levels.includes('warn')
      ? 'warn'
      : levels.includes('info')
        ? 'info'
        : levels.includes('debug')
          ? 'debug'
          : 'trace';

export const summarizeByTag = <TContext>(
  envelopes: readonly DiagnosticEnvelope<TContext>[],
): KeyedMessages<readonly ['error', 'warn', 'info', 'debug', 'trace']> => {
  const grouped = {
    error: [] as DiagnosticMessage[],
    warn: [] as DiagnosticMessage[],
    info: [] as DiagnosticMessage[],
    debug: [] as DiagnosticMessage[],
    trace: [] as DiagnosticMessage[],
  };
  for (const envelope of envelopes) {
    for (const message of envelope.messages) {
      grouped[message.level].push(message);
    }
  }
  return grouped;
};
