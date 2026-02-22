import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildTelemetryWindow,
  buildTimelineSummary,
  buildProfileByMode,
  buildTenantDigest,
} from '@domain/recovery-drill/src/telemetry';
import { summarizeRiskByTenant } from '@domain/recovery-drill/src/risk';
import { InMemoryRecoveryDrillStore } from '@data/recovery-drill-store';
import { useRecoveryDrillCatalog } from './useRecoveryDrillCatalog';
import { withBrand } from '@shared/core';
import type { DrillRunRecord } from '@data/recovery-drill-store';

interface UseRecoveryDrillTelemetryInput {
  readonly tenant: string;
}

interface UseRecoveryDrillTelemetryResult {
  readonly loading: boolean;
  readonly digest: number;
  readonly timeline: ReturnType<typeof buildTimelineSummary>;
  readonly riskByTenant: ReturnType<typeof summarizeRiskByTenant>;
  readonly modeBreakdown: ReturnType<typeof buildProfileByMode>;
  readonly refresh: () => Promise<void>;
}

export const useRecoveryDrillTelemetry = ({ tenant }: UseRecoveryDrillTelemetryInput): UseRecoveryDrillTelemetryResult => {
  const store = useMemo(() => new InMemoryRecoveryDrillStore(), []);
  const { templates, initialized } = useRecoveryDrillCatalog({ tenant });
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<readonly DrillRunRecord[]>([]);

  const loadTelemetry = useCallback(async () => {
    setLoading(true);
    const all = await store.runs.findRuns({ tenant: withBrand(tenant, 'TenantId') });
    setRuns(all.items);
    setLoading(false);
  }, [store, tenant]);

  useEffect(() => {
    void loadTelemetry();
  }, [loadTelemetry, initialized]);

  const timeline = useMemo(() => buildTimelineSummary(runs), [runs]);
  const window = useMemo(
    () =>
      buildTelemetryWindow(
        runs,
        tenant,
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
      ),
    [runs, tenant],
  );
  const digest = buildTenantDigest(runs);
  const riskByTenant = summarizeRiskByTenant(templates.map((template) => ({ tenantId: template.tenantId, template: template.template })));
  const modeBreakdown = useMemo(() => buildProfileByMode(runs), [runs]);

  void window;

  return {
    loading,
    digest,
    timeline,
    riskByTenant,
    modeBreakdown,
    refresh: loadTelemetry,
  };
};
