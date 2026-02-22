import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';

import { buildCommandBuckets, computeTrend, type CommandMetricReport } from '@domain/recovery-drill/src/command-metrics';
import type { DrillMode, DrillTemplate, RecoveryDrillTenantId } from '@domain/recovery-drill/src';

interface HookArgs {
  readonly tenantId: string;
  readonly templates: readonly DrillTemplate[];
  readonly compareTemplates: readonly DrillTemplate[];
}

interface HookResult {
  readonly reports: readonly CommandMetricReport[];
  readonly selectedMode: DrillMode;
  readonly setMode: (mode: DrillMode) => void;
  readonly bucketCount: number;
  readonly trends: readonly { bucket: string; movement: 'increase' | 'decrease' | 'steady'; delta: number }[];
}

const defaultModes: readonly DrillMode[] = ['tabletop', 'game-day', 'automated-chaos', 'customer-sim'];

export const useRecoveryDrillIntelligence = ({ tenantId, templates, compareTemplates }: HookArgs): HookResult => {
  const [selectedMode, setMode] = useState<DrillMode>(defaultModes[0]);
  const tenant: RecoveryDrillTenantId = useMemo(() => withBrand(tenantId, 'TenantId'), [tenantId]);

  const latest = useMemo(() => {
    return defaultModes.map((mode) => {
      return buildCommandBuckets({
        tenantId: tenant,
        templates,
        filter: {
          tenant,
          mode,
        },
        mode,
      });
    });
  }, [tenantId, templates, selectedMode]);

  const compare = useMemo(() => {
    const compareReport = buildCommandBuckets({
        tenantId: tenant,
      templates: compareTemplates,
      filter: { tenant },
      mode: selectedMode,
    });
    return {
      compareReport,
      templateCount: compareTemplates.length,
    };
  }, [compareTemplates, tenantId, selectedMode]);

  const trends = useMemo(
    () =>
      latest
        .flatMap((current) => {
          const previousMode = current.mode === 'tabletop' ? undefined : defaultModes[defaultModes.indexOf(current.mode) - 1];
          const emptyReport: CommandMetricReport = {
            tenantId: tenant,
            mode: selectedMode,
            totalTemplates: 0,
            buckets: [],
            top: [],
            plan: undefined,
          };
          const previous = previousMode
            ? latest.find((item) => item.mode === previousMode) ?? emptyReport
            : emptyReport;
          return computeTrend(previous, current);
        }),
    [latest, tenant, selectedMode],
  );

  return {
    reports: latest,
    selectedMode,
    setMode,
    bucketCount: latest.reduce((sum, item) => sum + item.buckets.length, 0) + compare.templateCount,
    trends,
  };
};
