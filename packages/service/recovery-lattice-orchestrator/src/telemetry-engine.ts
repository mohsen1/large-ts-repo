import { NoInfer } from '@shared/type-level';
import {
  type LatticeMetricSample,
  MetricId,
  metricSummary,
  makeMetricId,
  createCollector,
  type LatticeMetricWindow,
  type MetricBucketKey,
} from '@domain/recovery-lattice';
import {
  type LatticeContext,
  type LatticeTenantId,
  asRegionId,
  asZoneId,
  makeTimestamp,
  makeTraceId,
} from '@domain/recovery-lattice';
import { asRouteId } from '@domain/recovery-lattice';

export type TelemetryStreamMode = 'stream' | 'snapshot' | 'replay';
export type TelemetryWindowId = `window:${string}`;
export type StreamMetricKind = 'raw' | 'normalized';
export type MetricWindowEnvelope<TContext extends object = Record<string, unknown>> = Readonly<{
  windowId: TelemetryWindowId;
  routeId: string;
  window: LatticeMetricWindow<TContext>;
  tuple: readonly LatticeMetricSample<TContext>[];
  mode: TelemetryStreamMode;
}>;

type MetricStack = {
  use(resource: object & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void;
  [Symbol.asyncDispose](): PromiseLike<void>;
};

const newMetricStack = (): { new (): MetricStack } => {
  const fallback = class {
    readonly #stack = new Set<() => PromiseLike<void>>();
    use(resource: object & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void {
      const dispose = resource?.[Symbol.asyncDispose];
      if (typeof dispose === 'function') {
        this.#stack.add(() => dispose.call(resource));
      }
    }
    async [Symbol.asyncDispose](): Promise<void> {
      for (const dispose of [...this.#stack]) {
        await dispose();
      }
      this.#stack.clear();
    }
  };

  return (
    (globalThis as { AsyncDisposableStack?: { new (): MetricStack } }).AsyncDisposableStack ?? fallback
  );
};

const iteratorFrom = (globalThis as { Iterator?: { from?: <T>(value: Iterable<T>) => IterableIterator<T> } }).Iterator?.from;

export interface MetricWindowCursor {
  readonly windowId: TelemetryWindowId;
  readonly routeId: string;
  readonly samples: number;
  readonly severity: number;
}

export interface StreamResult<TContext extends object = Record<string, unknown>> {
  readonly tenantId: LatticeTenantId;
  readonly count: number;
  readonly windows: readonly LatticeMetricWindow<TContext>[];
  readonly cursors: readonly MetricWindowCursor[];
  readonly routeKeys: readonly string[];
};

export interface StreamEnvelope<TContext extends object = Record<string, unknown>> {
  readonly mode: TelemetryStreamMode;
  readonly tenantId: LatticeTenantId;
  readonly windows: readonly MetricWindowEnvelope<TContext>[];
  readonly fingerprint: string;
  readonly createdAt: string;
}

const normalizeRoute = (routeId: string): string =>
  routeId.trim().toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9:\\-]/g, '');

const severityScale = (samples: number): number => {
  if (samples > 10_000) return 3;
  if (samples > 2_000) return 2;
  if (samples > 200) return 1;
  return 0;
};

const createWindowId = (tenantId: LatticeTenantId, routeId: string): TelemetryWindowId =>
  `window:${tenantId}:${routeId}:${Date.now().toString(36)}` as TelemetryWindowId;

export const collectMetricSamples = <TContext extends object>(
  samples: Iterable<LatticeMetricSample<TContext>>,
): readonly LatticeMetricSample<TContext>[] => {
  const iterable = iteratorFrom ? iteratorFrom(samples) : samples;
  return [...iterable].toSorted((left, right) => left.name.localeCompare(right.name));
};

export const buildStreamFingerprint = <TContext extends object>(
  windows: readonly LatticeMetricWindow<TContext>[],
): string => {
  return windows
    .map((window) => `${window.tenantId}:${window.metric}:${window.samples.length}`)
    .toSorted()
    .join('|');
};

export class LatticeTelemetryEngine<TContext extends object = Record<string, unknown>> {
  readonly #tenantId: LatticeTenantId;
  readonly #routeId: string;
  readonly #collector;
  readonly #windows: LatticeMetricWindow<TContext>[] = [];

  public constructor(tenantId: LatticeTenantId, routeId: string) {
    const metricId = makeMetricId(tenantId, routeId);
    this.#tenantId = tenantId;
    this.#routeId = normalizeRoute(routeId);
    this.#collector = createCollector<TContext>(tenantId, this.#routeId, metricId, {
      maxSamples: 256,
      windowMs: 60_000,
      thresholds: [20, 100, 250],
    });
  }

  public sample<TPayload extends object>(
    value: NoInfer<TPayload>,
    routeId: string,
    sampleId?: string,
  ): void {
    this.#collector.record({
      tenantId: this.#tenantId,
      timestamp: makeTimestamp(),
      name: makeMetricId(this.#tenantId, `${sampleId ?? 'sample'}:${routeId}`),
      unit: 'count',
      value: 1,
      severity: 'stable',
      context: value as unknown as TContext,
      tags: [routeId],
    });
  }

  public snapshot(): LatticeMetricWindow<TContext> {
    const window = this.#collector.snapshot();
    const fingerprint = buildStreamFingerprint([window]);
    this.#windows.push({
      ...window,
      route: normalizeRoute(window.route),
      tenantId: this.#tenantId,
      samples: [...window.samples],
      buckets: { ...window.buckets },
    });
    return {
      ...window,
      route: normalizeRoute(window.route),
      tenantId: this.#tenantId,
      samples: [...window.samples],
      buckets: { ...window.buckets },
    };
  }

  public summarize(): StreamResult<TContext> {
    const routeKeys = [...new Set(this.#windows.map((window) => String(window.route)))];
    return {
      tenantId: this.#tenantId,
      count: this.#windows.length,
      windows: this.#windows.toSorted((left, right) => right.samples.length - left.samples.length),
      cursors: this.#windows.map((window) => ({
        windowId: createWindowId(this.#tenantId, String(window.route)),
        routeId: String(window.route),
        samples: window.samples.length,
        severity: severityScale(window.samples.length),
      })),
      routeKeys,
    };
  }

  public toEnvelope(mode: TelemetryStreamMode): StreamEnvelope<TContext> {
    return {
      mode,
      tenantId: this.#tenantId,
      windows: this.#windows.map((window) => ({
        windowId: createWindowId(this.#tenantId, String(window.route)),
        routeId: String(window.route),
        window,
        tuple: [...window.samples],
        mode,
      })),
      fingerprint: buildStreamFingerprint(this.#windows),
      createdAt: new Date().toISOString(),
    };
  }

  public routeSummary(): readonly string[] {
    return this.summarize().routeKeys;
  }

  public metricSummaryFor(routeId: string): string {
    const summary = this.snapshot();
    return metricSummary(
      {
        tenantId: this.#tenantId,
        regionId: asRegionId('region:default'),
        zoneId: asZoneId('zone:default'),
        requestId: makeTraceId('metric', routeId),
      } as LatticeContext,
      summary,
    );
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    const Stack = newMetricStack();
    await using stack = new Stack();
    await this.#collector[Symbol.asyncDispose]();
    stack.use({
      [Symbol.asyncDispose]: async () => {
        this.#windows.length = 0;
      },
    });
  }
}

export const createTelemetryEngine = async <TContext extends object>(
  tenantId: LatticeTenantId,
  routeId: string,
): Promise<LatticeTelemetryEngine<TContext>> => {
  await asRouteId(`route:${routeId}`);
  return new LatticeTelemetryEngine<TContext>(tenantId, routeId);
};
