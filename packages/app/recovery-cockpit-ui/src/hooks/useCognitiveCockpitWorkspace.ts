import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SignalLayer } from '@domain/recovery-cockpit-cognitive-core';
import {
  type OrchestratorInput,
  collectSignals,
  summarizeWorkspace,
} from '@service/recovery-cockpit-cognitive-orchestrator';

export interface WorkspaceMetrics {
  readonly total: number;
  readonly latest: string;
  readonly byLayer: Readonly<Record<SignalLayer, number>>;
}

export interface WorkspaceStatus {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly metrics: WorkspaceMetrics;
  readonly healthScore: number;
  readonly topLayers: readonly SignalLayer[];
  readonly loading: boolean;
}

const scoreWeight = (layer: SignalLayer, count: number): number =>
  ({
    readiness: 35,
    continuity: 22,
    drift: 18,
    policy: 12,
    anomaly: 10,
    capacity: 8,
  })[layer] * Math.min(1, count / 100);

export const useCognitiveCockpitWorkspace = (input: OrchestratorInput): WorkspaceStatus & {
  readonly refresh: () => Promise<void>;
} => {
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState('');
  const [byLayer, setByLayer] = useState<Readonly<Record<SignalLayer, number>>>({
    readiness: 0,
    continuity: 0,
    drift: 0,
    policy: 0,
    anomaly: 0,
    capacity: 0,
  });
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [snapshot, rawSignals] = await Promise.all([
      summarizeWorkspace(input),
      collectSignals(input),
    ]);
    const normalized = { ...byLayer, ...snapshot.byLayer };
    setByLayer({
      readiness: normalized.readiness ?? 0,
      continuity: normalized.continuity ?? 0,
      drift: normalized.drift ?? 0,
      policy: normalized.policy ?? 0,
      anomaly: normalized.anomaly ?? 0,
      capacity: normalized.capacity ?? 0,
    });
    setLatest(snapshot.latest);
    setTotal(rawSignals.length);
    setLoading(false);
  }, [input, byLayer]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const healthScore = useMemo(() => {
    const weighted = (Object.entries(byLayer) as [SignalLayer, number][]).reduce(
      (acc, [layer, value]) => acc + scoreWeight(layer, value),
      0,
    );
    return Math.min(100, Math.round(100 - Math.max(0, Math.min(100, weighted))));
  }, [byLayer]);

  const topLayers = useMemo(() => {
    return (Object.entries(byLayer) as [SignalLayer, number][])
      .sort((left, right) => right[1] - left[1])
      .slice(0, 2)
      .map(([layer]) => layer);
  }, [byLayer]);

  return {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    loading,
    metrics: {
      total,
      latest,
      byLayer,
    },
    healthScore,
    topLayers,
    refresh,
  };
};
