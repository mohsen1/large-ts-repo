import { createDisposableScope } from '@shared/recovery-lab-kernel';
import { withBrand } from '@shared/core';
import type { Brand, NoInfer } from '@shared/type-level';
import type { DesignPlanId, DesignSignalKind, PlanSignal, WorkspaceTag } from './contracts';

export type SignalWindowId = Brand<string, 'SignalWindowId'>;
export type WindowRoute = `window/${DesignSignalKind}`;

export interface SignalWindow {
  readonly id: SignalWindowId;
  readonly route: WindowRoute;
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly average: number;
}

export interface SignalWindowSet {
  readonly route: WindowRoute;
  readonly signals: readonly PlanSignal[];
}

export interface SignalWorkbenchEvent {
  readonly kind: `event/${DesignSignalKind}`;
  readonly at: number;
  readonly detail: string;
}

export type GroupedSignals<T extends readonly PlanSignal[]> = {
  [K in T[number] as `metric:${K['metric']}`]: readonly K[];
};

type RecursiveWindowRoute<T extends readonly PlanSignal[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends { metric: DesignSignalKind; stage: infer TStage }
    ? readonly [`${Head['metric']}:${Extract<TStage, string>}`, ...RecursiveWindowRoute<Tail & readonly PlanSignal[]>]
    : readonly []
  : readonly [];

const aggregateByMetric = <TSignals extends readonly PlanSignal[]>(signals: NoInfer<TSignals>): Map<string, PlanSignal[]> => {
  const buckets = new Map<string, PlanSignal[]>();
  for (const signal of signals) {
    const current = buckets.get(signal.metric) ?? [];
    buckets.set(signal.metric, [...current, signal]);
  }
  return buckets;
};

export const signalWindowId = (
  runId: DesignPlanId,
  metric: DesignSignalKind,
  index: number,
): SignalWindowId => withBrand(`${runId}::${metric}::${index}`, 'SignalWindowId');

export const signalRoute = (metric: DesignSignalKind): WindowRoute => `window/${metric}`;

export const groupByMetric = <TSignals extends readonly PlanSignal[]>(signals: NoInfer<TSignals>): GroupedSignals<TSignals> => {
  const grouped = aggregateByMetric(signals);
  return Object.fromEntries(
    [...grouped.entries()].map(([metric, values]) => [`metric:${metric}`, values] as const),
  ) as unknown as GroupedSignals<TSignals>;
};

export const buildSignalWindows = <TSignals extends readonly PlanSignal[]>(
  signals: NoInfer<TSignals>,
  bucketSize = 4,
): readonly SignalWindow[] => {
  const grouped = groupByMetric(signals);
  const windows: SignalWindow[] = [];

  for (const key of Object.keys(grouped) as Array<`metric:${DesignSignalKind}`>) {
    const metric = key.slice(7) as DesignSignalKind;
    const rows = (grouped as Record<string, readonly PlanSignal[]>)[key] ?? [];
    const values = rows
      .map((entry) => (Number.isFinite(entry.value) ? entry.value : parseFloat(entry.timestamp)))
      .toSorted((left, right) => left - right);

    for (let index = 0; index < values.length; index += bucketSize) {
      const chunk = values.slice(index, index + bucketSize);
      windows.push({
        id: signalWindowId(rows[0]?.runId ?? (`bootstrap:${metric}` as DesignPlanId), metric, index),
        route: signalRoute(metric),
        from: chunk[0] ?? 0,
        to: chunk[chunk.length - 1] ?? 0,
        count: chunk.length,
        average: chunk.reduce((left, right) => left + right, 0) / Math.max(1, chunk.length),
      });
    }
  }

  return windows.toSorted((left, right) => left.from - right.from);
};

export const signalRouteSignature = <TSignals extends readonly PlanSignal[]>(signals: NoInfer<TSignals>): RecursiveWindowRoute<TSignals> => {
  const collect = (entries: readonly PlanSignal[]): RecursiveWindowRoute<TSignals> => {
    if (entries.length === 0) {
      return [] as unknown as RecursiveWindowRoute<TSignals>;
    }
    const [first, ...rest] = entries as readonly [PlanSignal, ...PlanSignal[]];
    const next = collect(rest);
    const signature = `${first.metric}:${first.stage}` as const;
    return [signature, ...next] as unknown as RecursiveWindowRoute<TSignals>;
  };

  return collect(signals);
};

export const normalizeWindowSet = <TSignals extends readonly PlanSignal[]>(signals: NoInfer<TSignals>): {
  readonly byMetric: GroupedSignals<TSignals>;
  readonly windows: readonly SignalWindow[];
} => {
  const byMetric = groupByMetric(signals);
  const windows = buildSignalWindows(signals);
  return { byMetric, windows };
};

export class SignalWorkbench {
  readonly #windows = new Map<string, SignalWindowSet>();
  readonly #events: SignalWorkbenchEvent[] = [];

  record<TSignals extends readonly PlanSignal[]>(signals: TSignals): readonly SignalWindow[] {
    const normal = normalizeWindowSet(signals);
    const entries = Object.entries(normal.byMetric) as Array<[keyof GroupedSignals<TSignals>, readonly PlanSignal[]]>;

    for (const [metric, entriesSignals] of entries) {
      const route = signalRoute((metric as string).replace('metric:', '') as DesignSignalKind);
      const count = entriesSignals.length;
      this.#windows.set(String(metric), {
        route,
        signals: entriesSignals,
      });
      this.recordEvent({
        kind: `event/${routeSignatureValue(route)}`,
        at: Date.now(),
        detail: `${count}`,
      });
    }

    return normal.windows;
  }

  list(metric: DesignSignalKind): readonly SignalWindow[] {
    return buildSignalWindows(
      this.#windows.get(`metric:${metric}`)?.signals ?? [],
      3,
    ).toSorted((left, right) => right.count - left.count);
  }

  get events(): readonly SignalWorkbenchEvent[] {
    return [...this.#events];
  }

  async withScope<T>(fn: (scope: AsyncDisposableStack) => Promise<T>): Promise<T> {
    await using scope = createDisposableScope();
    return fn(scope);
  }

  private recordEvent(entry: SignalWorkbenchEvent): void {
    this.#events.push(entry);
  }

  clear(): void {
    this.#windows.clear();
    this.#events.length = 0;
  }
}

const routeSignatureValue = (route: WindowRoute): DesignSignalKind =>
  route.replace('window/', '') as DesignSignalKind;

export const normalizeRouteSet = <TWindows extends readonly SignalWindow[]>(
  windows: NoInfer<TWindows>,
): Readonly<Record<string, number>> => {
  const groups = new Map<string, number>();
  for (const window of windows) {
    const key = window.route;
    groups.set(key, (groups.get(key) ?? 0) + window.count);
  }
  return Object.fromEntries(groups);
};

export const metricTag = (metric: DesignSignalKind): WorkspaceTag => {
  const palette: Record<DesignSignalKind, WorkspaceTag> = {
    health: 'tag:health',
    capacity: 'tag:capacity',
    compliance: 'tag:compliance',
    cost: 'tag:cost',
    risk: 'tag:risk',
  };
  return palette[metric];
};
