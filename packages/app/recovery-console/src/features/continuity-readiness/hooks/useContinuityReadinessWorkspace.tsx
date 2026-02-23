import { useCallback, useEffect, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import {
  buildReadinessEnvelope,
  ContinuityReadinessIds,
  aggregateCoverageRisk,
  buildCoverageWeights,
  type ContinuityReadinessCoverage,
  type ContinuityReadinessEnvelope,
  type ContinuityReadinessSignal,
  type ContinuityReadinessTenantId,
  type ContinuityReadinessWorkspace,
} from '@domain/recovery-continuity-readiness';
import { ContinuityReadinessStore, readinessFixtures } from '@data/continuity-readiness-store';
import { ContinuityReadinessOrchestrator } from '@service/continuity-readiness-orchestrator';
import { ok, fail } from '@shared/result';

type WorkspaceState = {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly tenantId: ContinuityReadinessTenantId;
  readonly workspace: ContinuityReadinessWorkspace | null;
  readonly envelope: ContinuityReadinessEnvelope | null;
  readonly summary: string;
  readonly coverage: readonly ContinuityReadinessCoverage[];
  readonly runbookCount: number;
  readonly errors: readonly string[];
};

interface HookInput {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly surfaceId: string;
}

const store = new ContinuityReadinessStore();
store.seed(readyTenant('tenant-continuity-readiness'));

const orchestrator = new ContinuityReadinessOrchestrator({
  gateway: {
    persistEnvelope: async () => ok(undefined),
    persistRun: async () => ok(undefined),
    announceSelection: async () => ok(undefined),
  },
  notifications: {
    notifyCritical: async () => ok(undefined),
  },
});

function readyTenant(value: string) {
  return readinessFixtures((value as ContinuityReadinessTenantId));
}

export const useContinuityReadinessWorkspace = ({ tenantId, tenantName, surfaceId }: HookInput): WorkspaceState & {
  refresh: () => Promise<void>;
  runOrchestration: () => Promise<void>;
} => {
  const [status, setStatus] = useState<WorkspaceState['status']>('idle');
  const [workspace, setWorkspace] = useState<ContinuityReadinessWorkspace | null>(null);
  const [envelope, setEnvelope] = useState<ContinuityReadinessEnvelope | null>(null);
  const [summary, setSummary] = useState('');
  const [errors, setErrors] = useState<readonly string[]>([]);

  const seed = useMemo(() => readyTenant(tenantId), [tenantId]);
  const surface = seed.surfaces[0];

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrors([]);
    const built = buildReadinessEnvelope({
      tenantId: tenantId as ContinuityReadinessTenantId,
      surfaceId: ContinuityReadinessIds.surface(surfaceId),
      tenantName,
      signals: (surface?.signals ?? []) as readonly ContinuityReadinessSignal[],
      objectives: [
        {
          id: withBrand(`${tenantId}:surface-objective`, 'ContinuityObjectiveId'),
          tenantId: tenantId as ContinuityReadinessTenantId,
          targetRtoMinutes: 12,
          targetRpoMinutes: 4,
          slaName: 'Continuity Readiness SLO',
          criticality: 'medium',
          owners: ['readiness-engine'],
        },
      ],
      horizonMinutes: 150,
    });

    if (!built.ok) {
      setErrors([built.error.message]);
      setStatus('error');
      return;
    }

    const nextEnvelope = built.value.envelope;
    const nextWorkspace: ContinuityReadinessWorkspace = {
      tenantId: nextEnvelope.tenantId,
      tenantName,
      selectedPlanId: nextEnvelope.surface.plans[0]?.id ?? (nextEnvelope.run?.planId ?? ('' as ContinuityReadinessWorkspace['selectedPlanId'])),
      projection: nextEnvelope.projection,
      coverage: nextEnvelope.coverage,
    };

    store.seed(seed);
    store.putSurface(nextEnvelope);

    setEnvelope(nextEnvelope);
    setWorkspace(nextWorkspace);
    setSummary(nextEnvelope.run ? `run=${nextEnvelope.run.id}` : built.value.summary);
    setStatus('ready');
  }, [tenantId, tenantName, surfaceId, surface, seed]);

  const runOrchestration = useCallback(async () => {
    setStatus('loading');
    const result = await orchestrator.run({
      tenantId: tenantId as ContinuityReadinessTenantId,
      tenantName,
      surfaceId: ContinuityReadinessIds.surface(surfaceId),
      signals: (surface?.signals ?? []) as readonly ContinuityReadinessSignal[],
      objective: 'Continuity recovery objective',
      horizonMinutes: 110,
    });

    if (!result.ok) {
      setErrors([result.error.message]);
      setStatus('error');
      return;
    }

    const run = result.value;
    setSummary((previous) => `${previous} | latest run ${run.id}`);
    setErrors([]);
    setStatus('ready');
  }, [tenantId, tenantName, surfaceId, surface]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const coverage = workspace?.coverage ?? [];
  const runbookCount = useMemo(() => {
    const plans = envelope?.surface.plans ?? [];
    const weights = buildCoverageWeights(plans);
    return Math.max(1, weights.length);
  }, [coverage]);
  const riskScore = useMemo(() => aggregateCoverageRisk(coverage), [coverage]);

  return {
    status,
    tenantId: tenantId as ContinuityReadinessTenantId,
    workspace,
    envelope,
    summary: `${summary} | risk ${riskScore}`,
    coverage,
    runbookCount,
    errors,
    refresh,
    runOrchestration,
  };
};
