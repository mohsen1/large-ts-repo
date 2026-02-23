import { useCallback, useMemo, useRef, useState } from 'react';
import type { SignalBundle, SignalPulse } from '@domain/recovery-signal-intelligence';
import { createWorkspace } from '@service/recovery-signal-intelligence-orchestrator';

export interface SignalIntelligenceWorkspaceSnapshot {
  readonly campaignCount: number;
  readonly activeCount: number;
  readonly completedCount: number;
  readonly errors: readonly string[];
}

const buildPulse = (facility: string, tenant: string, index: number): SignalPulse => {
  return {
    id: `${tenant}-pulse-${facility}-${index}`,
    category: 'incident',
    tenantId: tenant,
    facilityId: facility,
    dimension: index % 3 === 0 ? 'capacity' : index % 3 === 1 ? 'latency' : 'availability',
    value: 100 + index * 9 + facility.length,
    baseline: 80 + index,
    weight: 0.4 + (index * 0.11),
    timestamp: new Date(Date.now() - index * 60_000).toISOString(),
    observedAt: new Date().toISOString(),
    source: 'simulator',
    unit: 'rps',
    tags: ['sim', `idx-${index}`],
  };
};

const buildBundle = (tenantId: string, facilityId: string): SignalBundle => ({
  id: `${tenantId}:${facilityId}:bundle:${Date.now()}`,
  tenantId,
  pulses: Array.from({ length: 6 }, (_, index) => buildPulse(facilityId, tenantId, index)),
  envelopes: [],
  generatedBy: 'recovery-incident-dashboard',
  generatedAt: new Date().toISOString(),
});

export const useSignalIntelligenceWorkspace = (tenantId: string, actor: string) => {
  const workspaceRef = useRef(createWorkspace());
  const workspace = workspaceRef.current;
  const [report, setReport] = useState<SignalIntelligenceWorkspaceSnapshot>({
    campaignCount: 0,
    activeCount: 0,
    completedCount: 0,
    errors: [],
  });

  const load = useCallback(() => {
    const next = workspace.report();
    setReport((state) => ({
      ...state,
      campaignCount: next.campaignCount,
      activeCount: next.activeCount,
      completedCount: next.completedCount,
    }));
  }, [workspace]);

  const onboard = useCallback((facilityId: string) => {
    try {
      const bundle = buildBundle(tenantId, facilityId);
      const next = workspace.onboardBundle(bundle, actor);
      setReport({
        campaignCount: next.campaignCount,
        activeCount: next.activeCount,
        completedCount: next.completedCount,
        errors: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown workspace error';
      setReport((state) => ({
        ...state,
        errors: [...state.errors, message],
      }));
    }
  }, [actor, tenantId, workspace]);

  const executeCycle = useCallback(() => {
    const next = workspace.executeCycle();
    setReport((state) => ({
      ...state,
      campaignCount: Math.max(state.campaignCount, next.campaignCount),
      activeCount: next.activeCount,
      completedCount: next.completedCount,
      errors: [],
    }));
  }, [workspace]);

  const facilities = useMemo(() => ['facility-a', 'facility-b', 'facility-c'], []);

  return {
    report,
    facilities,
    onboard,
    executeCycle,
    load,
  };
};
