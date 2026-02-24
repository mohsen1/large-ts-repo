import { createRepository, type RecoveryHorizonRepository } from '@data/recovery-horizon-store';
import { err, ok, type Result } from '@shared/result';
import type { PluginStage, HorizonSignal, JsonLike, TimeMs } from '@domain/recovery-horizon-engine';
import { inspectGraph } from './lab-inspector';

export interface StreamEnvelope<T> {
  readonly at: TimeMs;
  readonly stage: PluginStage;
  readonly payload: T;
}

export interface LabSignalWindow {
  readonly tenantId: string;
  readonly stage: PluginStage;
  readonly cursor: number;
  readonly records: readonly StreamEnvelope<HorizonSignal<PluginStage, JsonLike>>[];
}

export interface SignalWindowRequest {
  readonly tenantId: string;
  readonly limit: number;
  readonly stageWindow: readonly PluginStage[];
}

type SignalStream = AsyncIterable<StreamEnvelope<HorizonSignal<PluginStage, JsonLike>>>;

type StageWindow = StreamEnvelope<HorizonSignal<PluginStage, JsonLike>>[];
type SignalWindowResult = readonly StreamEnvelope<HorizonSignal<PluginStage, JsonLike>>[];

const stamp = (signal: HorizonSignal<PluginStage, JsonLike>): StreamEnvelope<HorizonSignal<PluginStage, JsonLike>> => ({
  at: Date.now() as TimeMs,
  stage: signal.kind,
  payload: signal,
});

const collect = async <T>(values: AsyncIterable<T>): Promise<readonly T[]> => {
  const out: T[] = [];
  for await (const value of values) {
    out.push(value);
  }
  return out;
};

export const readSignalsWindow = async (
  request: SignalWindowRequest,
): Promise<Result<readonly LabSignalWindow[]>> => {
  const repository = createRepository(request.tenantId);
  const stream = await repository.streamSignals({
    tenantId: request.tenantId,
    stages: request.stageWindow,
    includeArchived: true,
    maxRows: request.limit,
  });

  if (!stream.ok) {
    return err(stream.error);
  }

  const records = await collect(stream.value);
  const mapped = records.map((entry) => stamp(entry));

  const grouped = request.stageWindow.map((stage) => {
    const items = mapped.filter((entry) => entry.stage === stage);
    return {
      tenantId: request.tenantId,
      stage,
      cursor: items.length,
      records: items,
    } satisfies LabSignalWindow;
  });

  return ok(grouped);
};

export const streamDiagnostics = async (request: SignalWindowRequest): Promise<Result<string>> => {
  if (!request.tenantId || request.limit <= 0 || !request.stageWindow.length) {
    return err(new Error('invalid request'));
  }

  const windows = await readSignalsWindow(request);
  if (!windows.ok) {
    return err(windows.error);
  }

  const score = windows.value.reduce((acc, window) => acc + window.records.length, 0);
  const graphRun = await inspectGraph(request.tenantId, request.stageWindow);
  if (!graphRun.ok) {
    return err(graphRun.error);
  }

  return ok(`tenant=${request.tenantId} count=${score} graph=${graphRun.value}`);
};

export class LabSignalStream implements AsyncDisposable, Disposable {
  readonly #repository: RecoveryHorizonRepository;
  readonly #tenantId: string;

  constructor(tenantId: string) {
    this.#tenantId = tenantId;
    this.#repository = createRepository(tenantId);
  }

  async [Symbol.asyncDispose]() {
    return Promise.resolve();
  }

  [Symbol.dispose]() {
    return;
  }

  async stream(limit = 500): Promise<Result<SignalStream>> {
    const signals = await this.#repository.streamSignals({
      tenantId: this.#tenantId,
      includeArchived: true,
      stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
      maxRows: limit,
    });

    if (!signals.ok) {
      return err(signals.error);
    }

    return ok((async function* () {
      for await (const signal of signals.value) {
        yield stamp(signal);
      }
    })());
  }
}

export const streamLabTimeline = async (
  tenantId: string,
  stageWindow: readonly PluginStage[],
): Promise<Result<SignalWindowResult>> => {
  const source = new LabSignalStream(tenantId);
  using _scope = source;

  const iterable = await source.stream();
  if (!iterable.ok) {
    return err(iterable.error);
  }

  const list = [] as StageWindow;
  for await (const value of iterable.value) {
    if (stageWindow.includes(value.stage)) {
      list.push(value);
    }
  }

  return ok(list.slice(0, 500));
};
