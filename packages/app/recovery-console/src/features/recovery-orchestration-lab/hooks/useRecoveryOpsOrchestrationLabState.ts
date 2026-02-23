import { useEffect, useMemo, useState } from 'react';
import type { CommandSurface } from '@domain/recovery-ops-orchestration-surface';
import { RecoveryOpsOrchestrationStore } from '@data/recovery-ops-orchestration-store';

interface WorkspaceSignals {
  readonly surfaces: readonly CommandSurface[];
  readonly selectedSurfaceId: string | undefined;
}

export const useRecoveryOpsOrchestrationLabState = (tenantId: string, scenarioId: string): WorkspaceSignals => {
  const [surfaces, setSurfaces] = useState<readonly CommandSurface[]>([]);

  useEffect(() => {
    const store = new RecoveryOpsOrchestrationStore();
    const raw = store.searchSurfaces({ tenantId, scenarioId, limit: 20 });

    const mapped = raw.data
      .map((entry) => entry.surface)
      .filter((surface): surface is CommandSurface => Boolean(surface));

    setSurfaces(mapped);
  }, [tenantId, scenarioId]);

  const selectedSurfaceId = useMemo(() => {
    return surfaces[0]?.id;
  }, [surfaces]);

  return {
    surfaces,
    selectedSurfaceId,
  };
};
