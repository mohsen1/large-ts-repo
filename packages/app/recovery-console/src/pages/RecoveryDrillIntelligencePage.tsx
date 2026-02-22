import { useMemo } from 'react';

import { RecoveryDrillForecastPanel } from '../components/RecoveryDrillForecastPanel';
import { RecoveryDrillIntelligencePanel } from '../components/RecoveryDrillIntelligencePanel';
import { RecoveryDrillLifecyclePanel } from '../components/RecoveryDrillLifecyclePanel';
import { useRecoveryDrillCatalog } from '../hooks/useRecoveryDrillCatalog';
import { useRecoveryDrillTelemetry } from '../hooks/useRecoveryDrillTelemetry';
import type { DrillDependencies } from '@service/recovery-drill-orchestrator/src/types';
import type { DrillTemplateRecord } from '@data/recovery-drill-store/src';
import type { RecoveryDrillTemplateId, RecoveryDrillRunId } from '@domain/recovery-drill/src';

interface RecoveryDrillIntelligencePageProps {
  readonly tenant: string;
}

export const RecoveryDrillIntelligencePage = ({ tenant }: RecoveryDrillIntelligencePageProps) => {
  const catalog = useRecoveryDrillCatalog({ tenant });
  const telemetry = useRecoveryDrillTelemetry({ tenant });

  const catalogTemplates = useMemo(() => catalog.templates, [catalog.templates]);
  const dependencies = useMemo<DrillDependencies>(() => {
    return {
      templates: {
        upsertTemplate: async (record: DrillTemplateRecord) => record,
        listTemplates: async (tenantId) =>
          catalogTemplates.filter((template) => template.tenantId === tenantId),
        getTemplate: async (templateId: RecoveryDrillTemplateId) => catalogTemplates.find((item) => item.templateId === templateId),
      },
      runs: {
        upsertRun: async () => undefined,
        getRun: async (_runId: RecoveryDrillRunId) => undefined,
        listRuns: async () => ({ items: [], total: 0, nextCursor: undefined }),
      },
      notifier: {
        publish: async () => ({ ok: true, value: undefined }),
      },
    };
  }, [catalogTemplates, tenant]);

  return (
    <main>
      <h1>Recovery Drill Intelligence Console</h1>
      <p>Tenant digest: {telemetry.digest}</p>
      <p>
        Timeline points: {telemetry.timeline.totalPoints} · trend {telemetry.timeline.trend}
      </p>
      <RecoveryDrillIntelligencePanel tenantId={tenant} templates={catalogTemplates.map((item) => item.template)} />
      <RecoveryDrillForecastPanel tenantId={tenant} templates={catalogTemplates} runs={[]} />
      <RecoveryDrillLifecyclePanel templates={catalogTemplates} runs={[]} dependencies={dependencies} />
      <p>Mode summary: {telemetry.modeBreakdown.size}</p>
      <pre>{JSON.stringify({ tenant, totalTemplates: catalogTemplates.length }, null, 2)}</pre>
    </main>
  );
};
