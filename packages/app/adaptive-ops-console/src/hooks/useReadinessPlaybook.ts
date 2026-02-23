import { useEffect, useMemo, useState } from 'react';
import type {
  ReadinessPlaybookTemplate,
  ReadinessPriority,
  PlaybookSignal,
} from '@domain/recovery-readiness/playbook-models';
import { listCatalog, buildSearchSuggestions, rankCatalogByPriority } from '@data/recovery-readiness-store';
import { getPlaybookHealth } from '@service/recovery-readiness-orchestrator/readiness-playbook-metrics';
import { runReadinessScheduler } from '@service/recovery-readiness-orchestrator/readiness-playbook-scheduler';
import { assertPlaybookSchema } from '@domain/recovery-readiness/playbook-models';

export interface UseReadinessPlaybookFilter {
  search: string;
  priority?: ReadinessPriority;
  category?: ReadonlyArray<ReadinessPlaybookTemplate['playbook']['category']>;
}

export interface UseReadinessPlaybookState {
  loading: boolean;
  templates: ReadinessPlaybookTemplate[];
  suggestionTerms: string[];
  selectedTemplate: ReadinessPlaybookTemplate | null;
  error: string | null;
  scheduledCount: number;
  failedCount: number;
}

export interface HealthSeriesPoint {
  bucket: string;
  completed: number;
  failed: number;
}

interface HealthState {
  snapshots: Array<{ template: ReadinessPlaybookTemplate; total: number; trend: string; buckets: HealthSeriesPoint[] }>;
}

const seedSignals: PlaybookSignal[] = [
  {
    id: 'signal.customer-impact',
    name: 'Customer impact',
    value: 86,
    reliability: 0.94,
    observedAt: new Date().toISOString(),
    tags: ['customer', 'sla'],
  },
  {
    id: 'signal.latency',
    name: 'Latency spike',
    value: 73,
    reliability: 0.88,
    observedAt: new Date().toISOString(),
    tags: ['infra', 'sla'],
  },
  {
    id: 'signal.error-rate',
    name: 'Error rate',
    value: 61,
    reliability: 0.9,
    observedAt: new Date().toISOString(),
    tags: ['quality', 'api'],
  },
];

const safePriority = (value?: ReadinessPriority): ReadinessPriority | undefined => {
  if (!value) return undefined;
  return ['low', 'normal', 'high', 'critical'].includes(value) ? value : undefined;
};

const buildSeedPlaybookStep = () => ({
  id: 'seed-step',
  title: 'Assess readiness',
  summary: 'Initial automated validation pass',
  kind: 'validate',
  estimatedMinutes: 15,
  automationEligible: true,
  dependencies: [],
  requiredSignals: ['signal.customer-impact'],
  constraints: [],
  actionParams: {},
});

export const useReadinessPlaybook = (filter: UseReadinessPlaybookFilter) => {
  const [state, setState] = useState<UseReadinessPlaybookState>({
    loading: true,
    templates: [],
    suggestionTerms: [],
    selectedTemplate: null,
    error: null,
    scheduledCount: 0,
    failedCount: 0,
  });
  const [health, setHealth] = useState<HealthState>({ snapshots: [] });

  useEffect(() => {
    let running = true;

    const bootstrap = async () => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      const catalogResult = await listCatalog(filter.search, {
        includeInactive: true,
      });

      if (!running) return;
      if (!catalogResult.ok) {
        setState((previous) => ({ ...previous, loading: false, error: catalogResult.error.message }));
        return;
      }

      const catalog = rankCatalogByPriority(catalogResult.value).slice(0, 12);
      const hydrated = await Promise.all(
        catalog.map(async (catalogItem: {
          id: string;
          name: string;
          category: ReadinessPlaybookTemplate['playbook']['category'];
          priority: ReadinessPlaybookTemplate['playbook']['priority'];
          revision: number;
          steps: number;
        }) => {
          const item = {
            id: `${catalogItem.id}-template`,
            title: `${catalogItem.name} template`,
            definition: {
              horizonHours: Math.max(1, catalogItem.steps),
              refreshCadenceMinutes: 15,
              maxConcurrency: 2,
              allowParallelRun: true,
              blackoutWindows: [],
            },
            playbook: {
              id: catalogItem.id,
              name: catalogItem.name,
              category: catalogItem.category,
              description: `${catalogItem.name} readiness playbook`,
              ownerTeam: 'ops-engineering',
              priority: catalogItem.priority,
              steps: [buildSeedPlaybookStep()],
              tags: ['recovery', 'autonomous'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              revision: catalogItem.revision,
            },
          };

          const parsed = assertPlaybookSchema(item.playbook);
          return {
            ...item,
            playbook: parsed,
          };
        }),
      );

      const allowedCategories = new Set(filter.category ?? []);
      const filtered = filter.search
        ? hydrated.filter((item: (typeof hydrated)[number]) =>
            item.playbook.name.toLowerCase().includes(filter.search.toLowerCase()) &&
            (allowedCategories.size === 0 || allowedCategories.has(item.playbook.category)),
          )
        : hydrated.filter((item: (typeof hydrated)[number]) =>
            allowedCategories.size === 0 || allowedCategories.has(item.playbook.category),
          );

      const suggestionTerms = buildSearchSuggestions(catalogResult.value);

      const selected = filtered.find((item: (typeof filtered)[number]) => {
        if (!filter.priority) return true;
        const normalized = safePriority(filter.priority);
        return normalized ? item.playbook.priority === normalized : false;
      }) ?? null;

      const snapshots = await Promise.all(
        filtered.map(async (item: (typeof filtered)[number]) => {
          const metrics = await getPlaybookHealth(item);
          return {
            template: item,
            total: metrics?.metrics.runCount ?? 0,
            trend: metrics?.trend ?? 'stable',
            buckets: metrics?.seriesBuckets ?? [],
          };
        }),
      );

      setHealth({ snapshots });
      setState((previous) => ({
        ...previous,
        loading: false,
        templates: filtered,
        suggestionTerms,
        selectedTemplate: selected,
        error: null,
      }));
    };

    void bootstrap();

    return () => {
      running = false;
    };
  }, [filter.search, filter.priority, filter.category]);

  const schedule = async (priority: ReadinessPriority, template: ReadinessPlaybookTemplate) => {
    const result = await runReadinessScheduler({
      playbooks: [template.playbook],
      priority,
      requester: 'adaptive-ops-console',
      signals: [...seedSignals],
    });

    setState((previous) => ({
      ...previous,
      scheduledCount: previous.scheduledCount + result.accepted.length,
      failedCount: previous.failedCount + result.rejected.length,
    }));

    return result.accepted.length > 0;
  };

  const orderedSnapshots = useMemo(() => {
    return [...health.snapshots].sort((left, right) => right.total - left.total);
  }, [health]);

  return {
    ...state,
    schedule,
    healthSnapshots: orderedSnapshots,
    totalHealthSnapshots: orderedSnapshots.length,
    isReady: !state.loading && state.error === null,
    isEmpty: !state.loading && health.snapshots.length === 0,
  };
};
