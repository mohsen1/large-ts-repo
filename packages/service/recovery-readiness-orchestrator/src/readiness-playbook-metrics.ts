import {
  summarizeRuns,
  buildSeries,
  classifyRiskTrend,
} from '@data/recovery-readiness-store/playbook-metrics';
import type {
  ReadinessPlaybookTemplate,
  PlaybookDefinition,
  ReadinessRun,
} from '@domain/recovery-readiness/playbook-models';
import { listCatalog, buildSearchSuggestions, rankCatalogByPriority } from '@data/recovery-readiness-store';
import { createReadinessEventStore } from '@data/recovery-readiness-store/readiness-event-store';
import { getPlaybookRepository } from '@data/recovery-readiness-store/playbook-repository';
import { toReadinessEvent, type ReadinessSignal, type ReadinessRunId, type RecoveryTargetId } from '@domain/recovery-readiness';

export interface PlaybookHealthSnapshot {
  template: ReadinessPlaybookTemplate;
  metrics: ReturnType<typeof summarizeRuns>;
  trend: ReturnType<typeof classifyRiskTrend>;
  seriesBuckets: ReturnType<typeof buildSeries>;
  suggestions: string[];
}

export interface QueueReadinessPayload {
  playbook: PlaybookDefinition;
  run: ReadinessRun;
}

const eventStore = createReadinessEventStore();

export const getPlaybookHealth = async (template: ReadinessPlaybookTemplate): Promise<PlaybookHealthSnapshot | null> => {
  const repo = getPlaybookRepository();
  const playbookRunResult = await repo.findLatestRun(template.playbook.id);
  if (!playbookRunResult.ok || !playbookRunResult.value) return null;

  const run = playbookRunResult.value;
  const metrics = summarizeRuns([run], 15);
  const trend = classifyRiskTrend([run]);
  const seriesBuckets = buildSeries([run]);
  const catalog = await listCatalog('', { includeInactive: false });
  const suggestions = catalog.ok ? buildSearchSuggestions(catalog.value) : [];

  return {
    template,
    metrics: {
      ...metrics,
      playbookId: template.id,
    },
    trend,
    seriesBuckets,
    suggestions,
  };
};

export const readMetricsForCatalog = async (): Promise<PlaybookHealthSnapshot[]> => {
  const catalog = await listCatalog('', { includeInactive: true });
  if (!catalog.ok) return [];

  const ranked = rankCatalogByPriority(catalog.value);
  const snapshots: PlaybookHealthSnapshot[] = [];

  for (const item of ranked) {
    const template: ReadinessPlaybookTemplate = {
      id: `${item.id}-template`,
      title: `${item.name} template`,
      definition: {
        horizonHours: item.steps,
        refreshCadenceMinutes: 15,
        maxConcurrency: 2,
        allowParallelRun: true,
        blackoutWindows: [],
      },
      playbook: {
        id: item.id,
        name: item.name,
        category: item.category,
        description: `${item.name} template`,
        ownerTeam: 'recovery-analytics',
        priority: item.priority,
        steps: [],
        tags: ['recovery'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: item.revision,
      },
    };

    const health = await getPlaybookHealth(template);
    if (!health) continue;
    snapshots.push(health);
  }

  return snapshots;
};

export const emitQueuePayload = async (payload: QueueReadinessPayload): Promise<boolean> => {
  const syntheticSignal: ReadinessSignal = {
    signalId: `${payload.run.id}:metric` as ReadinessSignal['signalId'],
    runId: payload.run.id as ReadinessRunId,
    targetId: payload.playbook.id as RecoveryTargetId,
    source: 'manual-check',
    name: 'queue-metric',
    severity: payload.run.riskScore > 0.7 ? 'critical' : payload.run.riskScore > 0.4 ? 'high' : 'medium',
    capturedAt: new Date().toISOString(),
    details: {
      runId: payload.run.id,
      playbook: payload.playbook.id,
      signalValue: payload.run.riskScore * 100,
      source: 'queue',
    },
  };

  const event = toReadinessEvent(syntheticSignal, 'created', 'system');

  const result = await eventStore.append(event);
  return result.ok;
};
