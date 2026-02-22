import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  parseCatalogEnvelope,
  buildCatalogSummary,
  buildRunBundle,
} from '@domain/recovery-drill/src/adapters';
import { buildServiceOverview, summarizeMetricRows } from '@service/recovery-drill-orchestrator/src/metrics';
import { InMemoryRecoveryDrillStore } from '@data/recovery-drill-store';
import { RecoveryDrillOrchestrator } from '@service/recovery-drill-orchestrator';
import type { Result } from '@shared/result';
import { buildRunRecord, fromTemplate } from '@data/recovery-drill-store/src/adapter';
import { parseDrillTemplate } from '@domain/recovery-drill/src/schema';
import { withBrand } from '@shared/core';
import type { DrillRunRecord, DrillTemplateRecord } from '@data/recovery-drill-store';
import type { DrillProgressStatus } from '@service/recovery-drill-orchestrator/src/types';
import { fail, ok } from '@shared/result';
import type { RecoveryDrillTenantId } from '@domain/recovery-drill/src';
import type { DrillStoreQuery } from '@data/recovery-drill-store/src';

interface UseRecoveryDrillCatalogInput {
  readonly tenant: string;
}

interface UseRecoveryDrillCatalogResult {
  readonly initialized: boolean;
  readonly templates: readonly DrillTemplateRecord[];
  readonly selectedTemplateIds: readonly string[];
  readonly metrics: ReturnType<typeof summarizeMetricRows>;
  readonly starts: readonly {
    runId: string;
    status: DrillProgressStatus;
  }[];
  readonly loadCatalog: () => void;
  readonly seedDemo: () => Promise<Result<string, Error>>;
  readonly runTemplate: (templateId: string) => Promise<Result<DrillProgressStatus, Error>>;
}

class RecoveryDrillConsoleNotifier {
  async publish(): Promise<Result<void, Error>> {
    return ok(undefined);
  }
}

const buildDemoTemplate = (tenant: string) =>
  parseDrillTemplate({
    id: withBrand(`${tenant}:demo-template`, 'RecoveryDrillTemplateId'),
    tenantId: withBrand(`${tenant}`, 'TenantId'),
    service: withBrand(`${tenant}:core`, 'ServiceId'),
    title: 'Demo continuity drill',
    mode: 'game-day',
    priority: 'silver',
    window: {
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      timezone: 'UTC',
    },
    scenarios: [
      {
        id: 'scenario-cos',
        title: 'Cache fallback',
        summary: 'validate cache failover',
        objective: 'exercise read replica fallback',
        impact: 'medium',
        recoveryImpactScore: 20,
        steps: [
          {
            id: 'step-1',
            title: 'disable cache',
            command: 'cache:disable',
            targetServices: ['redis', 'api-gateway'],
            expectedSeconds: 30,
            requiredApprovals: 1,
            constraints: [
              {
                code: 'latency',
                description: 'max latency',
                targetService: 'redis',
                thresholdPct: 65,
                operator: 'lt',
              },
            ],
          },
        ],
        prerequisites: ['plan:drill-ready'],
        owners: ['ops'],
      },
    ],
    defaultApprovals: 2,
    createdBy: withBrand(`${tenant}:ops`, 'IdentityId'),
    tags: { domain: 'drill', tenant },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

export const useRecoveryDrillCatalog = ({ tenant }: UseRecoveryDrillCatalogInput): UseRecoveryDrillCatalogResult => {
  const [initialized, setInitialized] = useState(false);
  const [templates, setTemplates] = useState<readonly DrillTemplateRecord[]>([]);
  const [runs, setRuns] = useState<readonly DrillRunRecord[]>([]);
  const [starts, setStarts] = useState<readonly { runId: string; status: DrillProgressStatus }[]>([]);

  const typedTenant = useMemo<RecoveryDrillTenantId>(() => withBrand(tenant, 'TenantId'), [tenant]);

  const store = useMemo(() => new InMemoryRecoveryDrillStore(), []);
  const runStore = useMemo(
    () => ({
      listRuns: (query: DrillStoreQuery) => store.runs.findRuns(query),
      upsertRun: (record: DrillRunRecord) => store.runs.upsertRun(record),
      getRun: (runId: Parameters<(typeof store.runs)['getRun']>[0]) => store.runs.getRun(runId),
    }),
    [store.runs],
  );
  const orchestrator = useMemo(
    () =>
      new RecoveryDrillOrchestrator({
        templates: store.templates,
        runs: runStore,
        notifier: new RecoveryDrillConsoleNotifier() as never,
      }),
    [runStore, store.templates],
  );

  const bundle = useMemo(() => buildRunBundle(runs), [runs]);
  const summary = useMemo(() => {
    return buildCatalogSummary({
      tenantId: typedTenant,
      templates: templates.map((item) => item.template),
      minScore: 0,
    });
  }, [typedTenant, templates]);

  const loadCatalog = useCallback(() => {
    parseCatalogEnvelope({ tenant });
    void summary;
    void bundle.ids;
    void bundle.successRate;
    setInitialized(true);
  }, [tenant, bundle.ids, bundle.successRate, summary]);

  const seedDemo = useCallback(async () => {
    const record = fromTemplate(buildDemoTemplate(tenant));
    await store.templates.upsertTemplate(record);
    const all = await store.templates.listTemplates(withBrand(tenant, 'TenantId'));
    setTemplates(all);

    const context = buildRunRecord(record.template, {
      runId: withBrand(`${tenant}:seed-run`, 'RecoveryDrillRunId'),
      templateId: record.templateId,
      runAt: new Date().toISOString(),
      initiatedBy: withBrand(`${tenant}:ops`, 'IdentityId'),
      mode: 'game-day',
      approvals: 1,
    }, 'planned');

    await store.runs.upsertRun(context);
    const seeded = await store.runs.findRuns({ tenant: typedTenant });
    setRuns(seeded.items);
    setInitialized(true);
    return ok(record.templateId);
  }, [store, tenant, typedTenant]);

  const runTemplate = useCallback(
    async (templateId: string) => {
      const result = await orchestrator.start({ templateId: withBrand(templateId, 'RecoveryDrillTemplateId'), initiatedBy: withBrand(`${tenant}:operator`, 'IdentityId') });
      if (result.ok) {
        const nextRuns = await store.runs.findRuns({ tenant: typedTenant });
        setRuns(nextRuns.items);
        setStarts((current) => [...current, { runId: templateId, status: result.value }]);
      }
      return result;
    },
    [orchestrator, store.runs, tenant, typedTenant],
  );

  useEffect(() => {
    void seedDemo();
  }, [seedDemo]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const overview = buildServiceOverview(templates, runs);

  return {
    initialized,
    templates,
    selectedTemplateIds: (() => {
      const byTenant = overview.byTenant.get(tenant);
      return byTenant?.topHeatpointTemplate ? [byTenant.topHeatpointTemplate] : [];
    })(),
    metrics: summarizeMetricRows(templates, runs),
    starts,
    loadCatalog,
    seedDemo: seedDemo as () => Promise<Result<string, Error>>,
    runTemplate,
  };
};
