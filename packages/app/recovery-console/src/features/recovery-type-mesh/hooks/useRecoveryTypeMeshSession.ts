import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildFacetCatalog,
  routeValuesByVerb,
  type RouteFacet,
} from '@shared/type-level-hub';
import type { MeshMode, MeshPlanModel, MeshRouteCatalog, MeshState, MeshMetricRow } from '../types';
import { buildMeshBoard, createMeshEnvelope, meshCatalog } from '../types';
import { routeDecision, type RouteDecision } from '../components/TypeMeshTopologyStrip';

class DisposableSession {
  disposed = false;
  constructor(private readonly onDispose: () => void) {}
  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onDispose();
  }
  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }
}

type MetricSource = {
  key: string;
  score: number;
  phase: MeshMode;
  timestamp: string;
};

const makeMetricRows = <T extends MeshRouteCatalog>(catalog: T): readonly MeshMetricRow[] => {
  return Object.entries(catalog).map(([, route], index) => ({
    key: `${index}-${route}`,
    score: route.length + index,
    phase: 'observe',
    timestamp: new Date().toISOString(),
  }));
};

export interface UseRecoveryTypeMeshSessionProps {
  readonly tenant: string;
  readonly mode: MeshMode;
}

export interface UseRecoveryTypeMeshSessionResult {
  readonly session: MeshPlanModel;
  readonly routes: ReturnType<typeof buildFacetCatalog>;
  readonly active: boolean;
  readonly selectedPhase: RouteDecision;
  readonly filtered: readonly string[];
  readonly switchPhase: (phase: MeshMode) => void;
  readonly refresh: () => Promise<void>;
}

const buildInitialSession = (tenant: string, mode: MeshMode): MeshPlanModel => {
  const board = buildMeshBoard(meshCatalog);
  const envelope = createMeshEnvelope(tenant, meshCatalog);
  return {
    tenant: tenant as MeshPlanModel['tenant'],
    sessionId: `session-${tenant}`,
    runId: `run-${tenant}`,
    mode,
    state: 'idle',
    routeSet: envelope.routes,
    metrics: makeMetricRows(meshCatalog),
    signalMap: buildFacetCatalog(meshCatalog),
    labels: board.map((row) => row.id),
  };
};

export const useRecoveryTypeMeshSession = ({ tenant, mode }: UseRecoveryTypeMeshSessionProps): UseRecoveryTypeMeshSessionResult => {
  const [activeMode, setActiveMode] = useState<MeshMode>(mode);
  const [state, setState] = useState<MeshState>('idle');
  const [metrics, setMetrics] = useState<readonly MeshMetricRow[]>(() => makeMetricRows(meshCatalog));

  const session = useMemo<MeshPlanModel>(
    () => ({
      ...buildInitialSession(tenant, activeMode),
      tenant: `${tenant}:${activeMode}` as MeshPlanModel['tenant'],
      mode: activeMode,
      state,
      metrics,
      labels: metrics.map((metric) => metric.key),
    }),
    [activeMode, metrics, state, tenant],
  );

  const routes = useMemo(() => buildFacetCatalog(meshCatalog), []);
  const filtered = useMemo(
    () => routeValuesByVerb(meshCatalog, activeMode === 'simulate' ? 'simulate' : 'start'),
    [activeMode],
  );
  const selectedPhase = useMemo(() => routeDecision(window.location.pathname, activeMode), [activeMode]);

  const refresh = useCallback(async () => {
    setMetrics((existing) =>
      [...existing].map((entry) => ({
        ...entry,
        score: entry.score + 1,
        timestamp: new Date().toISOString(),
      })),
    );
  }, []);

  const switchPhase = useCallback((next: MeshMode) => {
    setActiveMode(next);
    setState(next === 'review' ? 'complete' : next === 'operate' ? 'running' : 'idle');
  }, []);

  useEffect(() => {
    using sessionScope = new DisposableSession(() => {
      setState('idle');
    });

    setState('running');
    const timer = setInterval(() => {
      void refresh();
    }, 1000);

    return () => {
      clearInterval(timer);
      sessionScope[Symbol.dispose]();
    };
  }, [refresh]);

  return {
    session,
    routes,
    active: state === 'running' || state === 'blocked',
    selectedPhase,
    filtered,
    switchPhase,
    refresh,
  };
};
