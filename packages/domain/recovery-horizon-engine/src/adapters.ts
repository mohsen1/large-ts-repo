import {
  HorizonSignal,
  PluginStage,
  StageLabel,
  PluginConfig,
  StageSpan,
  RunId,
  TimeMs,
  JsonLike,
  ValidationResult,
  PluginPayload,
  horizonBrand,
} from './types.js';
import { parseHorizonSignal } from './schema.js';

type WithSpan<T> = T & { readonly span: StageSpan<PluginStage> };

type Identity<T> = T;

export interface TransportEnvelope<TPayload = JsonLike> {
  readonly runId: RunId;
  readonly event: string;
  readonly payload: TPayload;
  readonly timestampMs: TimeMs;
}

export interface PipelineAdapter<
  TKind extends PluginStage,
  TInput extends PluginConfig<TKind, unknown>,
  TOutput extends PluginSignalLike,
> {
  readonly id: string;
  readonly supportedStages: readonly TKind[];
  normalize(input: TInput): WithSpan<TInput>;
  execute(input: ReadonlyArray<TInput>, signal: AbortSignal): Promise<TOutput[]>;
  toDiagnostic(input: TInput): string;
}

export interface PipelineContext {
  readonly runId: RunId;
  readonly correlationId: string;
  readonly startedAt: TimeMs;
}

export type PluginSignalLike = HorizonSignal<PluginStage, JsonLike>;

export type ExtractAdapterPayload<T> = T extends PipelineAdapter<any, infer I, any> ? I : never;
export type ExtractAdapterOutput<T> = T extends PipelineAdapter<any, any, infer O> ? O : never;

export const isRawSignal = (value: unknown): value is PluginSignalLike => {
  return typeof value === 'object' && value !== null && 'id' in (value as HorizonSignal)
    && 'kind' in (value as HorizonSignal);
};

export const parseAdapterSignal = (value: unknown): PluginSignalLike => {
  const signal = parseHorizonSignal(value);
  return signal;
};

const asRecord = (value: JsonLike): Record<string, JsonLike> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, JsonLike>;
  }

  return {};
};

export class NoopPipelineAdapter implements PipelineAdapter<PluginStage, PluginConfig<PluginStage, JsonLike>, PluginSignalLike> {
  readonly id = 'noop-pipeline-adapter';
  readonly supportedStages: readonly PluginStage[] = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'];

  normalize(input: PluginConfig<PluginStage, JsonLike>): WithSpan<PluginConfig<PluginStage, JsonLike>> {
    return {
      ...input,
      span: {
        stage: input.pluginKind,
        label: `${input.pluginKind.toUpperCase()}_STAGE` as StageLabel<PluginStage>,
        startedAt: 0 as TimeMs,
      },
    };
  }

  async execute(input: ReadonlyArray<PluginConfig<PluginStage, JsonLike>>): Promise<PluginSignalLike[]> {
    return input.map((entry, index) => {
      const payload: PluginPayload = entry.payload;
      const metadata = asRecord(payload);
      const metadataTenant = 'tenantId' in metadata
        ? metadata.tenantId
        : undefined;
      const runIdHint = 'runId' in metadata
        ? metadata.runId
        : undefined;

      const tenantId = typeof metadataTenant === 'string' && metadataTenant.length > 0
        ? metadataTenant
        : 'tenant-001';
      const runId = horizonBrand.fromRunId(typeof runIdHint === 'string' && runIdHint.length > 0 ? runIdHint : `run-${Date.now()}-${index}`);

      return {
        id: horizonBrand.fromPlanId(`noop-${tenantId}-${entry.pluginKind}-${index}`),
        kind: entry.pluginKind,
        payload: payload,
        input: {
          version: '1.0.0',
          runId,
          tenantId,
          stage: entry.pluginKind,
          tags: ['noop'],
          metadata: { source: this.id },
        },
        severity: 'low',
        startedAt: horizonBrand.fromDate(new Date().toISOString()),
      } as PluginSignalLike;
    });
  }

  toDiagnostic(input: PluginConfig<PluginStage, JsonLike>) {
    return `${this.id}:${input.pluginKind}`;
  }
}

export const makeAdapterError = (adapterId: string, issue: string): ValidationResult<never> => ({
  ok: false,
  errors: [
    {
      path: ['adapter', adapterId],
      severity: 'error',
      message: issue,
    },
  ],
});

export type AdapterOutcome<TAdapter extends PipelineAdapter<any, any, any>> = {
  readonly adapter: TAdapter;
  readonly output: readonly ExtractAdapterOutput<TAdapter>[];
  readonly consumed: number;
};

type AdapterTuple = readonly PipelineAdapter<any, any, any>[];
type AdapterOutputs<TAdapters extends AdapterTuple> = {
  [Index in keyof TAdapters]: AdapterOutcome<TAdapters[Index]>;
};

export const executeAdapters = async <TAdapters extends AdapterTuple>(
  adapters: TAdapters,
  runId: RunId,
  input: Identity<ReadonlyArray<PluginConfig<PluginStage, JsonLike>>>,
  signal?: AbortSignal,
): Promise<AdapterOutputs<TAdapters>> => {
  const context: PipelineContext = {
    runId,
    correlationId: `ctx-${runId}`,
    startedAt: 0 as TimeMs,
  };

  const outputs = await Promise.all(
    [...adapters].map(async (adapter): Promise<AdapterOutcome<any>> => {
      const normalized = input.map((entry) => {
        const candidate = adapter.normalize(entry as any);
        return candidate;
      });
      const signals = await adapter.execute(normalized as any, signal ?? new AbortController().signal);
      const parsed = signals.map((entry) => parseAdapterSignal(entry));
      return {
        adapter,
        output: parsed,
        consumed: parsed.length + context.correlationId.length,
      };
    }),
  );

  return outputs as AdapterOutputs<TAdapters>;
};
