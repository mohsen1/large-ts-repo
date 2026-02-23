import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRecommendations, createRecoveryQueryFromContext, toExecutionReport } from '@domain/recovery-playbooks';
import { createPortfolioManager, createMonitor } from '@service/recovery-playbook-engine';
import { InMemoryRecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import { seedRecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import type {
  PlaybookCatalogState,
  PlaybookLabConfig,
  PlaybookLabPageState,
  PlaybookSelectionRow,
  PlaybookTelemetryRow,
  SeededPlaybook,
} from '../types';
import type {
  RecoveryPlaybookContext,
  RecoveryPlanExecution,
  RecoveryPlanId,
  RecoveryPlaybookId,
  RecoveryPlaybookQuery,
  PlaybookSelectionPolicy,
} from '@domain/recovery-playbooks';
import { withBrand } from '@shared/core';

const baseConfig: PlaybookLabConfig = {
  tenantId: 'tenant-alpha',
  horizonHours: 8,
  refreshIntervalMs: 7_500,
  includeDeprecated: false,
};

const basePolicy: PlaybookSelectionPolicy = {
  maxStepsPerRun: 16,
  allowedStatuses: ['published'],
  requiredLabels: ['automated'],
  forbiddenChannels: [],
};

const buildContext = (tenantId: string): RecoveryPlaybookContext => ({
  tenantId,
  serviceId: `service-${tenantId}`,
  incidentType: 'manual',
  affectedRegions: ['global'],
  triggeredBy: tenantId,
});

const emptyRow = (id: RecoveryPlaybookId): PlaybookSelectionRow => ({
  playbookId: id,
  title: 'No data',
  score: 0,
  status: 'queued',
  expectedMinutes: 0,
  reasons: ['uninitialized'],
});

const toHistoryRows = (reports: readonly ReturnType<typeof toExecutionReport>[]): readonly PlaybookTelemetryRow[] =>
  reports.map((report) => ({
    runId: report.run.id,
    playbookId: report.run.playbookId,
    startedAt: report.run.startedAt ?? new Date().toISOString(),
    completedAt: report.run.completedAt,
    status: report.run.status,
    selected: report.run.selectedStepIds.length,
    failures: report.run.telemetry.failures,
  }));

export const usePlaybookLab = (input: Partial<PlaybookLabConfig> = {}): PlaybookLabPageState => {
  const config = useMemo<PlaybookLabConfig>(() => ({ ...baseConfig, ...input }), [input]);
  const repository = useRef(new InMemoryRecoveryPlaybookRepository());
  const manager = useMemo(() => createPortfolioManager(repository.current), [repository]);
  const monitor = useMemo(() => createMonitor(repository.current), [repository]);
  const context = useMemo(() => buildContext(config.tenantId), [config.tenantId]);
  const [seeded, setSeeded] = useState<readonly SeededPlaybook[]>([]);
  const [rows, setRows] = useState<readonly PlaybookSelectionRow[]>([]);
  const [alerts, setAlerts] = useState<readonly string[]>([]);
  const [history, setHistory] = useState<readonly PlaybookTelemetryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<RecoveryPlanId | undefined>(undefined);
  const [catalogState, setCatalogState] = useState<PlaybookCatalogState>({
    query: createRecoveryQueryFromContext(context),
    policies: basePolicy,
    playbooks: [],
    loading: true,
    lastSyncedAt: new Date().toISOString(),
  });

  const loadCatalog = useCallback(async () => {
    const query = createRecoveryQueryFromContext(context);
    const repositoryQuery: RecoveryPlaybookQuery = {
      ...query,
      labels: query.labels ?? ['automated'],
      limit: query.limit ?? 25,
      tenantId: withBrand(config.tenantId, 'TenantId'),
    };
    const catalogResult = await repository.current.query(repositoryQuery);
    if (!catalogResult.ok) {
      setAlerts((previous) => [...previous, catalogResult.error]);
      setCatalogState((previous) => ({ ...previous, loading: false, query, lastSyncedAt: new Date().toISOString() }));
      return;
    }

    const playbooks = catalogResult.value.items.map((item) => item.playbook);
    const listResult = await manager.buildPortfolio(context);
    if (!listResult.ok) {
      setAlerts((previous) => [...previous, listResult.error]);
      setCatalogState((previous) => ({ ...previous, loading: false, query, lastSyncedAt: new Date().toISOString() }));
      return;
    }

    const recommendations = buildRecommendations(
      listResult.value.portfolio,
      playbooks,
      {
        tenantId: config.tenantId,
        clusters: ['greenfield', 'steady-state', 'incident-heavy'],
        maxCount: 12,
      },
    );

    const catalogMap = new Map(playbooks.map((playbook) => [playbook.id, playbook]));
    const derivedRows = recommendations.length > 0
      ? recommendations.map((recommendation): PlaybookSelectionRow => {
        const candidate = catalogMap.get(recommendation.playbookId);
        if (!candidate) return emptyRow(withBrand(`missing:${recommendation.playbookId}`, 'RecoveryPlaybookId'));
        return {
          playbookId: candidate.id,
          title: candidate.title,
          score: recommendation.score,
          status: 'queued',
          expectedMinutes: recommendation.estimatedMinutes,
          reasons: recommendation.rationale,
        };
      })
      : [emptyRow(withBrand('seed:empty', 'RecoveryPlaybookId'))];

    setRows(derivedRows);

    const latest = derivedRows.at(0)?.playbookId ?? withBrand('seed:empty', 'RecoveryPlaybookId');
    const historySample = toExecutionReport(
      {
        id: `${config.tenantId}:run:${Date.now()}` as RecoveryPlanExecution['id'],
        runId: `${config.tenantId}:run:${Date.now()}` as RecoveryPlanExecution['runId'],
        playbookId: latest,
        status: 'pending',
        selectedStepIds: [],
        startedAt: new Date().toISOString(),
        operator: config.tenantId,
        telemetry: {
          attempts: 0,
          failures: 0,
          recoveredStepIds: [],
        },
      },
      1,
      ['prepared'],
    );
    setHistory((previous) => [...previous.slice(-120), ...toHistoryRows([historySample])]);

    const normalizedQuery = createRecoveryQueryFromContext(context);
    setCatalogState({
      query: normalizedQuery,
      policies: basePolicy,
      playbooks,
      loading: false,
      lastSyncedAt: new Date().toISOString(),
    });
  }, [context, manager, config.tenantId, repository]);

  const seedCatalog = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await seedRecoveryPlaybookRepository(repository.current);
      setSeeded(payload);
      setAlerts((previous) => [...previous, `seeded ${payload.length} playbooks`]);
      await loadCatalog();
    } finally {
      setBusy(false);
    }
  }, [loadCatalog, repository]);

  const runLatest = useCallback(async () => {
    setBusy(true);
    try {
      const queuedId = `${config.tenantId}:run:${Date.now()}`;
      setActiveRunId(queuedId as RecoveryPlanId);
      if (rows[0]) {
        setAlerts((previous) => [...previous, `queued ${rows[0].playbookId}`]);
      }
      await monitor.emit(`portfolio-${config.tenantId}`);
    } finally {
      setBusy(false);
    }
  }, [rows, config.tenantId, monitor]);

  const startLastRun = useCallback(async () => {
    if (!activeRunId) return;
    await monitor.emit(activeRunId);
  }, [activeRunId, monitor]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadCatalog();
    }, config.refreshIntervalMs);
    void loadCatalog();
    return () => clearInterval(timer);
  }, [config.refreshIntervalMs, loadCatalog]);

  const runCount = history.length;
  const failureCount = history.filter((entry) => entry.status === 'failed').length;
  const health = runCount > 0 ? `failures/${failureCount}` : 'ready';

  return {
    pageTitle: `${config.tenantId} Playbook Lab (${runCount} runs)`,
    config,
    rows,
    catalog: catalogState,
    history,
    activeRunId,
    alerts,
    busy,
    health,
    seeded,
    policy: catalogState.policies,
    onRefresh: loadCatalog,
    onQueue: runLatest,
    onSeed: seedCatalog,
    onStartLastRun: startLastRun,
  };
};
