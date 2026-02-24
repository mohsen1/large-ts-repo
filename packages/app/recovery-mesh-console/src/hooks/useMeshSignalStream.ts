import { useEffect, useMemo, useState } from 'react';
import { parseTopology, type MeshSignalKind, type MeshTopology } from '@domain/recovery-ops-mesh';
import { type MeshPayloadFor } from '@service/recovery-ops-mesh-engine';
import { loadCatalog, submitCatalogSignal, toCatalogMap, buildCatalogPayload, type SignalCatalogItem, type SignalCatalogState } from '../services/meshSignalCatalog';
import { useMeshEngineWorkspace } from './useMeshWorkspace';

export interface StreamEvent {
  readonly id: string;
  readonly kind: MeshSignalKind;
  readonly when: number;
  readonly payload: MeshPayloadFor<MeshSignalKind>;
}

interface UseMeshSignalStreamOptions {
  readonly namespace?: string;
}

export interface MeshSignalStreamState {
  readonly catalog: SignalCatalogState | undefined;
  readonly events: readonly StreamEvent[];
  readonly ready: boolean;
  readonly selected: MeshSignalKind;
  readonly selectedMap: Readonly<Record<MeshSignalKind, SignalCatalogItem[]>>;
  readonly topology: MeshTopology;
  readonly send: (kind: MeshSignalKind, value: number) => Promise<void>;
  readonly select: (kind: MeshSignalKind) => void;
}

const fallbackTopology = parseTopology({
  id: 'fallback-topology',
  name: 'fallback',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
});

export const useMeshSignalStream = ({ namespace = 'mesh-stream' }: UseMeshSignalStreamOptions = {}): MeshSignalStreamState => {
  const workspace = useMeshEngineWorkspace({ planId: namespace });
  const [catalog, setCatalog] = useState<SignalCatalogState | undefined>(undefined);
  const [events, setEvents] = useState<readonly StreamEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<MeshSignalKind>('pulse');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const loaded = await loadCatalog();
      if (!mounted) {
        return;
      }
      setCatalog(loaded);
      setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !catalog) {
      return;
    }

    const timer = setInterval(() => {
      const payload = buildCatalogPayload(selected, catalog.items.length, catalog.mode);
      setEvents((current) => [
        {
          id: payload.id,
          kind: payload.signal.kind,
          when: payload.createdAt,
          payload: payload.signal,
        },
        ...current,
      ].slice(0, 24));
    }, 5000);

    return () => {
      clearInterval(timer);
    };
  }, [catalog, ready, selected]);

  const selectedMap = useMemo(
    () => (catalog ? toCatalogMap(catalog) : ({} as Readonly<Record<MeshSignalKind, SignalCatalogItem[]>>)),
    [catalog],
  );

  const send = async (kind: MeshSignalKind, value: number) => {
    const payload = {
      kind,
      payload: {
        value,
        metrics: {
          value,
          sample: 1,
        },
        reason: kind,
        severity: kind === 'alert' ? 'high' : 'low',
      },
    } as MeshPayloadFor<MeshSignalKind>;

    const envelopes = await submitCatalogSignal(workspace.topology.id, payload);

    const mapped = envelopes.map((envelope) => ({
      id: envelope.id,
      kind,
      when: envelope.emittedAt,
      payload: envelope.payload,
    }));

    setEvents((current) => [...mapped, ...current].slice(0, 24));
  };

  return {
    catalog,
    events,
    ready,
    selected,
    selectedMap,
    topology: workspace.topology,
    send,
    select: (kind) => {
      setSelected(kind);
    },
  };
};

const enrichTopology = (topology: MeshTopology, selected: MeshSignalKind): MeshTopology => {
  return {
    ...topology,
    name: `${topology.name}-${selected}`,
  };
};

export const getFallbackTopology = (): MeshTopology => enrichTopology(fallbackTopology, 'pulse');
