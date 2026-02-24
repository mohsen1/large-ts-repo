import { parseTopology, type MeshSignalKind } from '@domain/recovery-ops-mesh';
import { withBrand, type Brand } from '@shared/core';
import { createPluginSession } from '@shared/type-level';
import { normalizeLimit } from '@shared/core';
import { runWithQueue } from '@service/recovery-ops-mesh-engine';
import { type MeshPayloadFor } from '@service/recovery-ops-mesh-engine';

export interface SignalCatalogItem {
  readonly id: string;
  readonly kind: MeshSignalKind;
  readonly label: string;
  readonly value: number;
  readonly tags: readonly string[];
}

export type StreamMode = 'single' | 'batch';

export interface SignalCatalogState {
  readonly id: Brand<string, 'MeshSignalCatalogState'>;
  readonly namespace: string;
  readonly mode: StreamMode;
  readonly items: readonly SignalCatalogItem[];
}

export interface SignalCatalogEnvelope<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly id: string;
  readonly mode: StreamMode;
  readonly signal: MeshPayloadFor<TSignal>;
  readonly createdAt: number;
}

const baseItems = [
  { id: 'catalog-pulse', kind: 'pulse', label: 'Pulse', value: 1, tags: ['edge', 'low'] },
  { id: 'catalog-snapshot', kind: 'snapshot', label: 'Snapshot', value: 2, tags: ['mesh', 'state'] },
  { id: 'catalog-alert', kind: 'alert', label: 'Alert', value: 3, tags: ['critical', 'safety'] },
  { id: 'catalog-telemetry', kind: 'telemetry', label: 'Telemetry', value: 4, tags: ['metrics', 'telemetry'] },
] as const satisfies readonly SignalCatalogItem[];

const seededCatalog = Promise.resolve().then(async () => {
  const session = createPluginSession([], {
    name: 'mesh-signal-catalog',
    capacity: normalizeLimit(baseItems.length),
  });

  using _session = session;
  void _session;

  const namespace = withBrand('mesh-catalog', 'MeshPlanId');
  const mode: StreamMode = 'batch';

  return {
    id: withBrand(`${namespace}-${Date.now()}`, 'MeshSignalCatalogState'),
    namespace,
    mode,
    items: baseItems
      .map((item, index) => ({
        ...item,
        id: `${item.id}-${index}`,
        value: item.value + index,
      }))
      .toSorted((left, right) => left.value - right.value),
  } satisfies SignalCatalogState;
});

export const loadCatalog = async (): Promise<SignalCatalogState> => seededCatalog;

const buildSignalPayload = <TKind extends MeshSignalKind>(
  kind: TKind,
  value: number,
  snapshot?: string,
): MeshPayloadFor<TKind> => {
  if (kind === 'snapshot') {
    const snapshotTopology = parseTopology({
      id: withBrand(snapshot ?? 'snapshot-topology', 'MeshPlanId'),
      name: snapshot ?? 'snapshot-topology',
      version: '1.0.0',
      nodes: [],
      links: [],
      createdAt: Date.now(),
    });
    return { kind, payload: snapshotTopology } as unknown as MeshPayloadFor<TKind>;
  }

  if (kind === 'alert') {
    return {
      kind,
      payload: {
        severity: value > 5 ? 'critical' : 'high',
        reason: `${snapshot ?? 'runtime'}-${kind}-${value}`,
      },
    } as unknown as MeshPayloadFor<TKind>;
  }

  if (kind === 'telemetry') {
    return {
      kind,
      payload: {
        metrics: { value },
      },
    } as unknown as MeshPayloadFor<TKind>;
  }

  return {
    kind,
    payload: { value },
  } as unknown as MeshPayloadFor<TKind>;
};

export const buildCatalogPayload = <TSignal extends MeshSignalKind>(
  kind: TSignal,
  value: number,
  mode: StreamMode = 'single',
): SignalCatalogEnvelope<TSignal> => {
  const payload = buildSignalPayload(kind, value, mode);
  return {
    id: withBrand(`${kind}-${Date.now()}`, `mesh-cmd-${kind}`),
    mode,
    signal: payload,
    createdAt: Date.now(),
  };
};

export const submitCatalogSignal = async <TSignal extends MeshSignalKind>(
  planId: string,
  payload: MeshPayloadFor<TSignal>,
) => {
  const token = withBrand(`cat-${planId}-${Date.now()}`, 'engine-run-token');
  return runWithQueue(withBrand(planId, 'MeshPlanId'), token, payload);
};

export const toCatalogMap = (state: SignalCatalogState): Readonly<Record<MeshSignalKind, SignalCatalogItem[]>> => {
  const map = { pulse: [], snapshot: [], alert: [], telemetry: [] } as Record<MeshSignalKind, SignalCatalogItem[]>;
  for (const item of state.items) {
    map[item.kind].push(item);
  }
  return map;
};

export const expandCatalog = <TSignal extends MeshSignalKind>(
  state: SignalCatalogState,
  kind: TSignal,
  value: number,
): SignalCatalogState => {
  const mapped = state.items
    .map((entry) => ({
      ...entry,
      value: entry.kind === kind ? value : entry.value,
      label: `${entry.label}:${entry.value}`,
      tags: [...entry.tags, kind, state.mode],
    } as SignalCatalogItem))
    .toSorted((left, right) => right.value - left.value);

  return {
    ...state,
    items: mapped,
  };
};

export const summarizeCatalog = (items: readonly SignalCatalogItem[]): string =>
  items
    .map((item) => `${item.kind}[${item.value}]`)
    .toSorted()
    .join('|');

export const catalogItemToCatalogPayload = (item: SignalCatalogItem, value = 1): MeshPayloadFor<MeshSignalKind> =>
  item.kind === 'snapshot'
    ? ({
        kind: 'snapshot',
        payload: parseTopology({
          id: withBrand(`snapshot-${value}`, 'MeshPlanId'),
          name: item.label,
          version: '1.0.0',
          nodes: [],
          links: [],
          createdAt: Date.now(),
        }),
      } satisfies MeshPayloadFor<'snapshot'>)
    : item.kind === 'alert'
      ? ({ kind: 'alert', payload: { severity: 'high', reason: item.label } } satisfies MeshPayloadFor<'alert'>)
      : item.kind === 'telemetry'
      ? ({ kind: 'telemetry', payload: { metrics: { value } } } satisfies MeshPayloadFor<'telemetry'>)
      : ({ kind: 'pulse', payload: { value: item.value } } satisfies MeshPayloadFor<'pulse'>);
