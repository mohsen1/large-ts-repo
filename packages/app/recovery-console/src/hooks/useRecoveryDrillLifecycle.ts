import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';

import type { DrillProgressEvent } from '@service/recovery-drill-orchestrator/src';
import { createBatchOrchestrator } from '@service/recovery-drill-orchestrator/src/batch';
import type { DrillDependencies } from '@service/recovery-drill-orchestrator/src';
import { forecastRuns, type ForecastResult } from '@service/recovery-drill-orchestrator/src/forecast';
import { RecoveryDrillOrchestrator } from '@service/recovery-drill-orchestrator/src/orchestrator';
import type { DrillTemplateRecord, DrillRunRecord } from '@data/recovery-drill-store/src';
import type { RecoveryDrillTenantId, RecoveryDrillRunId } from '@domain/recovery-drill/src';

interface LifecycleHooks {
  readonly templates: readonly DrillTemplateRecord[];
  readonly runs: readonly DrillRunRecord[];
  readonly dependencies: DrillDependencies;
}

interface LifecycleState {
  readonly lastEvents: readonly DrillProgressEvent[];
  readonly lastForecast: ForecastResult | undefined;
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly canRun: boolean;
}

export const useRecoveryDrillLifecycle = ({ templates, runs, dependencies }: LifecycleHooks): [LifecycleState, () => Promise<void>] => {
  const [state, setState] = useState<LifecycleState>({
    lastEvents: [],
    lastForecast: undefined,
    loading: false,
    errorMessage: '',
    canRun: templates.length > 0 && runs.length > 0,
  });

  const latestTenant: RecoveryDrillTenantId = useMemo(
    () => templates[0]?.tenantId ?? (withBrand('global', 'TenantId')),
    [templates],
  );
  const orchestrator = useMemo(() => new RecoveryDrillOrchestrator(dependencies), [dependencies]);
  const batchOrchestrator = useMemo(() => createBatchOrchestrator(dependencies), [dependencies]);

  const runBatch = async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, errorMessage: '' }));
    try {
      const forecast = forecastRuns(
        latestTenant,
        templates,
        runs,
      );
      const result = await batchOrchestrator.runBatch({
        tenant: latestTenant,
        initiatedBy: 'ops-console',
        mode: 'game-day',
        limit: 2,
      });
      if (!result.ok) throw result.error;

      const planContext = await orchestrator.listOverview(latestTenant);
      const nextEvents: DrillProgressEvent[] = [
        {
          runId: withBrand(`${latestTenant}:summary`, 'RecoveryDrillRunId') as RecoveryDrillRunId,
          status: 'succeeded',
          at: new Date().toISOString(),
          details: `template-overview=${planContext.overview.byTenant.size}`,
        },
      ];
      setState((prev) => ({
        ...prev,
        loading: false,
        lastEvents: nextEvents,
        lastForecast: forecast,
        canRun: result.value.accepted > 0,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        errorMessage: (error as Error).message,
      }));
    }
  };

  return [state, runBatch];
}
