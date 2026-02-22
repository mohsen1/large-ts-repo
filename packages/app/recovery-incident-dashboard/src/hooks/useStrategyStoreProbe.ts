import { useEffect, useMemo, useState } from 'react';
import { createRecoveryStrategyStore, type StrategyStoreRecord } from '@data/recovery-strategy-store';
import type { OrchestrationTemplateId } from '@domain/recovery-orchestration-planning';

export interface StrategyStoreProbe {
  readonly loading: boolean;
  readonly tenants: readonly string[];
  readonly totalPlans: number;
  readonly metricsByTenant: ReadonlyRecord;
  readonly matching: readonly StrategyStoreRecord[];
}

interface ReadonlyRecord {
  readonly [tenant: string]: number;
}

interface StrategyStoreProbeActions {
  readonly refresh: () => Promise<void>;
  readonly filterByTemplate: (templateId: OrchestrationTemplateId) => void;
}

export const useStrategyStoreProbe = (): StrategyStoreProbe & { actions: StrategyStoreProbeActions } => {
  const [loading, setLoading] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<OrchestrationTemplateId | undefined>(undefined);
  const [records, setRecords] = useState<readonly StrategyStoreRecord[]>([]);

  const store = useMemo(() => createRecoveryStrategyStore(), []);

  const refresh = async () => {
    setLoading(true);
    const all = await store.listPlans({ tenantIds: [], includeCompleted: true, templateId: templateFilter });
    setRecords(all);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [templateFilter]);

  const metricsByTenant = records.reduce<Record<string, number>>((acc, record) => {
    acc[record.tenantId] = (acc[record.tenantId] ?? 0) + 1;
    return acc;
  }, {});

  const tenants = Object.keys(metricsByTenant);
  const totalPlans = records.length;

  return {
    loading,
    tenants,
    totalPlans,
    metricsByTenant,
    matching: records,
    actions: {
      refresh,
      filterByTemplate: (templateId) => {
        setTemplateFilter(templateId);
      },
    },
  };
};
