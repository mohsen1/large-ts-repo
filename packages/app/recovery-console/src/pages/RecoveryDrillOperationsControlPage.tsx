import { useMemo } from 'react';

import { RecoveryDrillForecastPanel } from '../components/RecoveryDrillForecastPanel';
import { RecoveryDrillIntelligencePanel } from '../components/RecoveryDrillIntelligencePanel';
import { RecoveryDrillTimelineHeatmap } from '../components/RecoveryDrillTimelineHeatmap';
import { useRecoveryDrillCatalog } from '../hooks/useRecoveryDrillCatalog';
import { useRecoveryDrillTelemetry } from '../hooks/useRecoveryDrillTelemetry';
import type { DrillTemplateRecord, DrillRunRecord } from '@data/recovery-drill-store/src';
import { withBrand } from '@shared/core';
import type { RecoveryDrillRunId } from '@domain/recovery-drill/src';

interface RecoveryDrillOperationsControlPageProps {
  readonly tenant: string;
}

export const RecoveryDrillOperationsControlPage = ({ tenant }: RecoveryDrillOperationsControlPageProps) => {
  const catalog = useRecoveryDrillCatalog({ tenant });
  const telemetry = useRecoveryDrillTelemetry({ tenant });
  const templates = useMemo(() => catalog.templates, [catalog.templates]);

  const runRecords = useMemo(() => {
    const runs: DrillRunRecord[] = [];
    const templateIds = new Set(templates.map((template: DrillTemplateRecord) => template.templateId));
    for (const templateId of templateIds) {
      for (const selected of catalog.selectedTemplateIds) {
        const runId = withBrand(`${tenant}:${templateId}:run:${selected}`, 'RecoveryDrillRunId') as RecoveryDrillRunId;
        runs.push({
          id: runId,
          templateId,
          status: 'succeeded',
          mode: 'tabletop',
          profile: {
            runId,
            elapsedMs: 1200,
            estimatedMs: 2600,
            queueDepth: 1,
            successRate: 1,
          },
          checkpoints: ['init', 'complete'],
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          plan: JSON.stringify({ selectedTemplateIds: catalog.selectedTemplateIds }),
          context: {
            runId,
            templateId,
            runAt: new Date().toISOString(),
            initiatedBy: withBrand(tenant, 'IdentityId'),
            mode: 'tabletop',
            approvals: 1,
          },
        });
      }
    }
    return runs;
  }, [catalog.selectedTemplateIds, templates, tenant]);

  const readinessText = useMemo(() => {
    const activeTemplates = templates.filter((template) => template.template.defaultApprovals > 0).length;
    return activeTemplates > 0 ? `active templates=${activeTemplates}` : 'no active templates';
  }, [templates]);

  return (
    <main>
      <h2>Recovery Drill Operations Control</h2>
      <p>{readinessText}</p>
      <p>Run telemetry digest: {telemetry.digest}</p>
      <RecoveryDrillIntelligencePanel tenantId={tenant} templates={templates.map((item) => item.template)} />
      <RecoveryDrillForecastPanel tenantId={tenant} templates={templates} runs={runRecords} />
      <RecoveryDrillTimelineHeatmap tenant={tenant} runs={runRecords} />
      <section>
        <h3>Template registry</h3>
        <ul>
          {templates.map((template) => (
            <li key={template.templateId}>
              {template.templateId} / scenarios={template.template.scenarios.length}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
