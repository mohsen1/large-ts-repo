import type { JsonValue } from '@shared/type-level';
import type {
  HorizonSessionId,
  HorizonTraceId,
  HorizonRunId,
  HorizonTenant,
  HorizonEnvelope,
  StageName,
  HorizonTag,
} from './runtime-types.js';

export interface HorizonTraceContext {
  readonly tenant: HorizonTenant;
  readonly runId: HorizonRunId;
  readonly sessionId: HorizonSessionId;
  readonly traceId: HorizonTraceId;
  readonly startedAt: number;
}

export interface TraceFrame extends HorizonEnvelope {
  readonly traceId: HorizonTraceId;
  readonly sessionId: HorizonSessionId;
  readonly tenant: HorizonTenant;
  readonly startedAt: number;
  readonly event: string;
  readonly metadata: Record<string, JsonValue>;
  readonly marker?: string;
}

export interface HorizonTrace {
  readonly context: HorizonTraceContext;
  readonly events: readonly TraceFrame[];
  readonly tags: readonly HorizonTag[];
}

interface AsyncStackLike {
  use<T>(value: T): T;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose]?(): Promise<void>;
}

export interface AsyncHorizonScope extends AsyncDisposable {
  flush(): Promise<readonly TraceFrame[]>;
}

export const createTrace = (input: {
  tenantId: HorizonTenant | string;
  sessionId?: HorizonSessionId | string;
  traceId?: HorizonTraceId | string;
  runId?: HorizonRunId | string;
}): HorizonTraceContext => ({
  tenant: input.tenantId as HorizonTenant,
  sessionId: (input.sessionId ?? `session:${Date.now()}`) as HorizonSessionId,
  traceId: (input.traceId ?? `trace:${Date.now()}`) as HorizonTraceId,
  runId: (input.runId ?? `run:${Date.now()}`) as HorizonRunId,
  startedAt: Date.now(),
});

export const toRuntimeTrace = (
  context: HorizonTraceContext,
  frames: readonly TraceFrame[] = [],
  tags: readonly HorizonTag[] = [],
): HorizonTrace => ({
  context,
  events: [...frames],
  tags,
});

type JsonRecord = Record<string, JsonValue>;

export class HorizonScope implements Disposable {
  #events: TraceFrame[] = [];
  #closed = false;
  #context: HorizonTraceContext;
  #label: StageName;
  #tenant: HorizonTenant;
  #sessionId: HorizonSessionId;

  constructor(
    context: HorizonTraceContext,
    label: StageName,
    tenant: HorizonTenant,
    sessionId: HorizonSessionId,
  ) {
    this.#context = context;
    this.#label = label;
    this.#tenant = tenant;
    this.#sessionId = sessionId;
    this.emit(`scope:${label}`, { initialized: true });
  }

  emit(event: string, metadata: JsonRecord = {}) {
    if (this.#closed) {
      return;
    }

    this.#events.push({
      sessionId: this.#context.sessionId,
      tenant: this.#tenant,
      runId: this.#context.runId,
      traceId: this.#context.traceId,
      startedAt: Date.now(),
      event,
      metadata,
      severity: 'info',
      eventKind: 'control',
      version: 'v1.0',
      stage: 'horizon:scope',
      tags: [],
      marker: this.#label,
    });
  }

  snapshot() {
    return [...this.#events];
  }

  get context(): HorizonTraceContext {
    return this.#context;
  }

  [Symbol.dispose]() {
    this.#closed = true;
  }
}

export class AsyncHorizonScope extends HorizonScope implements AsyncHorizonScope {
  #closed = false;
  readonly #trace: HorizonTraceContext;

  constructor(context: HorizonTraceContext, label: StageName, tenant: HorizonTenant, sessionId: HorizonSessionId) {
    super(context, label, tenant, sessionId);
    this.#trace = context;
  }

  async flush(): Promise<readonly TraceFrame[]> {
    if (this.#closed) {
      return [];
    }
    return this.snapshot();
  }

  async [Symbol.asyncDispose]() {
    this.#closed = true;
    await Promise.resolve();
  }

  get context(): HorizonTraceContext {
    return this.#trace;
  }
}

export const withHorizonScope = <T>(
  label: string,
  tenant: HorizonTenant,
  sessionId: HorizonSessionId,
  operation: (scope: HorizonScope) => T,
): T => {
  using scope = new HorizonScope(
    createTrace({ tenantId: tenant, sessionId }),
    label as StageName,
    tenant,
    sessionId,
  );
  scope.emit('open', { sessionId, tenant });
  try {
    return operation(scope);
  } finally {
    scope.emit('close', { sessionId, tenant });
  }
};

export const withAsyncHorizonScope = async <T>(
  label: string,
  tenant: HorizonTenant,
  sessionId: HorizonSessionId,
  operation: (scope: AsyncHorizonScope) => Promise<T>,
): Promise<T> => {
  const StackCtor = (
    globalThis as unknown as { AsyncDisposableStack?: new () => AsyncStackLike }
  ).AsyncDisposableStack;
  if (!StackCtor) {
    throw new Error('AsyncDisposableStack unavailable');
  }

  using _stack = new StackCtor();
  const scope = new AsyncHorizonScope(
    createTrace({ tenantId: tenant, sessionId }),
    label as StageName,
    tenant,
    sessionId,
  );
  _stack.use(scope);
  return operation(scope);
};

export const createScopeLog = <const TEvents extends readonly HorizonTrace[]>(
  events: TEvents,
): ReadonlyArray<readonly [string, HorizonTrace]> => events.map((event, index) => [`${index}`, event]);
