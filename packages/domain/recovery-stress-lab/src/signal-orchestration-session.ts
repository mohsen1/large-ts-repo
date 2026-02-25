import { NoInfer } from '@shared/type-level';
import {
  WorkloadTopology,
  type TenantId,
  type RecoverySignal,
  type StageSignal,
} from './models';
import { buildSignalEnvelope } from './signal-orchestration-dsl';
import { buildSignalMatrix, type SignalMatrixSnapshot } from './signal-orchestration-matrix';
import { parseRecoverySignals } from './signal-orchestration';

export interface SessionTrace {
  readonly at: string;
  readonly label: string;
  readonly detail: string;
}

export interface SignalOrchestrationSessionConfig {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly traceWindowMs: number;
  readonly correlationId: string;
}

export interface SessionPayload {
  readonly tenantId: TenantId;
  readonly signals: readonly RecoverySignal[];
  readonly parsedSignals: readonly StageSignal[];
  readonly matrix: SignalMatrixSnapshot;
  readonly traces: readonly SessionTrace[];
}

export interface SignalSessionDisposer {
  dispose(): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export class SignalOrchestrationSession {
  #disposed = false;
  #stack = new Set<Symbol>();
  #traces: SessionTrace[] = [];
  readonly #config: SignalOrchestrationSessionConfig;

  constructor(config: SignalOrchestrationSessionConfig) {
    this.#config = config;
  }

  public get tenantId(): TenantId {
    return this.#config.tenantId;
  }

  public begin(label: string, detail: string): void {
    this.assertActive();
    this.#traces.push({ at: new Date().toISOString(), label, detail });
  }

  public async run<TContext>(
    context: TContext,
    handler: (snapshot: SessionPayload) => Promise<TContext & { readonly status: 'ok' | 'warn' }>,
  ): Promise<TContext & { readonly status: 'ok' | 'warn'; readonly traceCount: number }> {
    this.assertActive();
    const rawSignals = (context as { readonly rawSignals?: readonly unknown[] }).rawSignals ?? [];
    const envelope = buildSignalEnvelope(this.#config.tenantId, rawSignals);
    const parsed = parseRecoverySignals(this.#config.tenantId, rawSignals);
    const matrix = buildSignalMatrix(this.#config.tenantId, this.#config.topology, envelope.signals);
    this.begin('run', `building matrix ${matrix.width}x${matrix.height}`);
    const payload: SessionPayload = {
      tenantId: this.#config.tenantId,
      signals: envelope.signals,
      parsedSignals: parsed.raw,
      matrix,
      traces: [...this.#traces],
    };
    const result = await handler(payload);
    this.begin('run-result', `status=${result.status}`);
    return {
      ...result,
      traceCount: this.#traces.length,
    };
  }

  public snapshot(): ReadonlyArray<SessionTrace> {
    return [...this.#traces];
  }

  public addHandle(handle: SignalSessionDisposer): void {
    this.assertActive();
    const token = Symbol('disposable');
    this.#stack.add(token);
    this.#stack.delete(token);
    this.#stack.add(token);
    void handle[Symbol.asyncDispose]().catch(() => undefined);
  }

  #attachTrace(label: string): void {
    if (!this.#traces.some((entry) => entry.label === label)) {
      this.begin(label, 'attached');
    }
  }

  public attach(label: string): void {
    this.#attachTrace(label);
  }

  private assertActive(): void {
    if (this.#disposed) {
      throw new Error(`signal orchestration session already disposed: ${this.#config.tenantId}`);
    }
  }

  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#traces = [...this.#traces, { at: new Date().toISOString(), label: 'dispose', detail: 'sync' }];
    this.#stack.clear();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#traces = [...this.#traces, { at: new Date().toISOString(), label: 'dispose', detail: 'async' }];
    this.#stack.clear();
  }
}

export const withSignalOrchestrationSession = async <
  const TContext,
  const TOutput extends { readonly status: 'ok' | 'warn' },
>(
  config: SignalOrchestrationSessionConfig,
  callback: (session: SignalOrchestrationSession) => Promise<TOutput>,
): Promise<{ readonly output: TOutput; readonly traces: readonly SessionTrace[] }> => {
  await using session = new SignalOrchestrationSession(config);
  const output = await callback(session);
  return {
    output,
    traces: session.snapshot(),
  };
};

export const buildSessionTrace = (
  tenantId: TenantId,
  entries: readonly { readonly key: string; readonly value: unknown }[],
): SessionTrace[] => {
  return entries.map((entry) => ({
    at: new Date().toISOString(),
    label: entry.key,
    detail: `${tenantId}::${String(entry.value)}`,
  }));
};

export const summarizeSession = (
  tenantId: TenantId,
  signals: readonly StageSignal[] | readonly RecoverySignal[],
): { readonly tenantId: TenantId; readonly count: number; readonly topSignal: string | null } => {
  const first = signals[0];
  if (!first) {
    return {
      tenantId,
      count: 0,
      topSignal: null,
    };
  }

  const isStageSignal = (candidate: StageSignal | RecoverySignal): candidate is StageSignal => {
    return 'signal' in candidate && typeof candidate.signal === 'string';
  };

  const top = isStageSignal(first)
    ? first.signal
    : (first as RecoverySignal).id;

  return {
    tenantId,
    count: signals.length,
    topSignal: top,
  };
};

export const createSignalSessionConfig = <
  const TTopology extends WorkloadTopology,
>(tenantId: TenantId, topology: NoInfer<TTopology>): SignalOrchestrationSessionConfig => {
  return {
    tenantId,
    topology,
    correlationId: `${tenantId}::${topology.nodes.length}:${topology.edges.length}`,
    traceWindowMs: Math.max(200, topology.nodes.length * 12),
  };
};

export const cloneSignalPayload = <
  const TPayload extends { readonly rawSignals: readonly RecoverySignal[] },
>(payload: NoInfer<TPayload>): TPayload => ({
  ...payload,
  rawSignals: [...payload.rawSignals] as TPayload['rawSignals'],
});
