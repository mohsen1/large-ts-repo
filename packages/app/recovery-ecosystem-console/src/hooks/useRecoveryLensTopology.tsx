import { useState, useEffect, useCallback, type ReactElement } from 'react';
import type { LensTopology } from '@domain/recovery-lens-observability-models';
import { buildSampleTopology, makeTopology, type LensTopologyNode } from '@domain/recovery-lens-observability-models';

export const useRecoveryLensTopology = (namespace: string): LensTopology => {
  const [value, setValue] = useState<LensTopology>({
    nodes: [],
    edges: [],
  });

  const refresh = useCallback(() => {
    const sample = buildSampleTopology(`namespace:${namespace}` as never);
    const top: LensTopology = makeTopology(sample.nodes as readonly LensTopologyNode[], sample.edges);
    setValue(top);
  }, [namespace]);

  useEffect(() => {
    refresh();
  }, [namespace, refresh]);

  return value;
};
