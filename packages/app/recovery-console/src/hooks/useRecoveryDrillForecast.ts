import { useMemo } from 'react';
import { withBrand } from '@shared/core';

import { forecastRuns, type ForecastResult } from '@service/recovery-drill-orchestrator/src/forecast';
import type { DrillTemplateRecord, DrillRunRecord } from '@data/recovery-drill-store/src';
import type { RecoveryDrillTenantId } from '@domain/recovery-drill/src';

interface ForecastHookInput {
  readonly tenantId: string;
  readonly templates: readonly DrillTemplateRecord[];
  readonly runs: readonly DrillRunRecord[];
}

interface ForecastHookState {
  readonly forecast: ForecastResult;
  readonly warningBuckets: readonly string[];
  readonly avgConfidence: number;
  readonly topRiskTemplateIds: readonly string[];
}

export const useRecoveryDrillForecast = ({ tenantId, templates, runs }: ForecastHookInput): ForecastHookState => {
  const tenant: RecoveryDrillTenantId = useMemo(() => withBrand(tenantId, 'TenantId'), [tenantId]);
  const forecast = useMemo(() => forecastRuns(tenant, templates, runs), [tenant, templates, runs]);
  const topRiskTemplateIds = useMemo(
    () => forecast.driftSignals.slice(0, 3).map((item) => item.templateId),
    [forecast],
  );
  const avgConfidence = useMemo(
    () => forecast.points.reduce((sum, point) => sum + point.confidence, 0) / Math.max(1, forecast.points.length),
    [forecast],
  );

  return {
    forecast,
    warningBuckets: forecast.topRiskBuckets,
    avgConfidence,
    topRiskTemplateIds,
  };
};
