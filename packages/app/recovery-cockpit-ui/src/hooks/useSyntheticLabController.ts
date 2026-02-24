import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCatalogDigest,
  buildScenarioPlan,
  collectTenantAudit,
  runSingleScenario,
  runTenantPlans,
  scenarioBlueprintByTenant,
  syntheticCatalogTenants,
  type ScenarioBlueprint,
  type ScenarioPlan,
  type ScenarioResultSet,
  type TenantId,
} from '@domain/recovery-cockpit-synthetic-lab';

type SyntheticCatalog = ReadonlyArray<ScenarioBlueprint>;

type AuditSummary = ReadonlyArray<{
  readonly scenario: string;
  readonly topPlugin: string;
  readonly frameCount: number;
  readonly avgDiagnostics: number;
}>;

type TelemetrySummary = {
  readonly tenant: TenantId;
  readonly runCount: number;
  readonly avgDurationMs: number;
};

export type SyntheticControllerState = {
  readonly tenants: readonly TenantId[];
  readonly activeTenant: TenantId;
  readonly catalog: SyntheticCatalog;
  readonly plans: readonly ScenarioPlan[];
  readonly scenarioCount: number;
  readonly selectedScenario: ScenarioBlueprint | undefined;
  readonly runHistory: readonly ScenarioResultSet[];
  readonly planMode: 'simulate' | 'drill' | 'predict';
  readonly scenarioDigest: string;
  readonly runQueue: readonly string[];
  readonly audit: AuditSummary;
  readonly telemetry: TelemetrySummary;
  readonly loading: boolean;
  readonly seeded: boolean;
};

type SyntheticControllerCommand = {
  readonly planMode: SyntheticControllerState['planMode'];
  readonly tenant: TenantId;
  readonly actor: string;
  readonly includeDiagnostics: boolean;
};

export type SyntheticControllerApi = {
  readonly state: SyntheticControllerState;
  readonly seed: () => Promise<void>;
  readonly selectTenant: (tenant: TenantId) => void;
  readonly selectScenario: (scenarioId: ScenarioBlueprint['id']) => void;
  readonly runSelected: (actor: string, includeDiagnostics: boolean) => Promise<void>;
  readonly runAll: (actor: string) => Promise<void>;
  readonly refreshAudit: () => Promise<void>;
  readonly setPlanMode: (planMode: SyntheticControllerState['planMode']) => void;
};

const weightedAudit = (payload: Awaited<ReturnType<typeof collectTenantAudit>>): AuditSummary =>
  payload
    .map((entry) => ({
      scenario: entry.scenario,
      topPlugin: entry.summary.topPlugin,
      frameCount: entry.summary.frameCount,
      avgDiagnostics: entry.summary.avgDiagnostics,
    }))
    .toSorted((left, right) => right.frameCount - left.frameCount);

const computeTelemetry = (runHistory: readonly ScenarioResultSet[], tenant: TenantId): TelemetrySummary => {
  const allSamples = runHistory.flatMap((entry) => entry.result.timeline);
  const avgDurationMs = allSamples.length === 0
    ? 0
    : allSamples.reduce((acc, entry) => acc + entry.value * 10, 0) / allSamples.length;

  return {
    tenant,
    runCount: runHistory.length,
    avgDurationMs: Number(avgDurationMs.toFixed(2)),
  };
};

const buildRunQueue = (tenant: TenantId, scenarioCatalog: SyntheticCatalog): readonly string[] =>
  scenarioCatalog
    .filter((entry) => entry.tenant === tenant)
    .toSorted((left, right) => right.steps.length - left.steps.length)
    .slice(0, 4)
    .map((entry) => `${entry.id}:${entry.metrics.length}`);

const buildScenarioRows = (catalog: SyntheticCatalog): readonly ScenarioPlan[] =>
  catalog
    .map((scenario) => buildScenarioPlan(scenario))
    .map((plan) => ({
      ...plan,
      tags: [...plan.tags],
      score: Number(plan.score.toFixed(4)),
      steps: [...plan.steps],
      startedAt: plan.startedAt,
    }));

export const useSyntheticLabController = (options: SyntheticControllerCommand): SyntheticControllerApi => {
  const tenants = syntheticCatalogTenants();
  const [activeTenant, setActiveTenant] = useState<TenantId>(tenants[0] ?? options.tenant);
  const [catalog, setCatalog] = useState<SyntheticCatalog>(scenarioBlueprintByTenant(activeTenant));
  const [selectedScenarioId, setSelectedScenarioId] = useState<ScenarioBlueprint['id'] | undefined>(undefined);
  const [planMode, setPlanModeState] = useState<SyntheticControllerState['planMode']>(options.planMode);
  const [runHistory, setRunHistory] = useState<readonly ScenarioResultSet[]>([]);
  const [audit, setAudit] = useState<AuditSummary>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [seeded, setSeeded] = useState<boolean>(false);

  const actorRef = useRef(options.actor);
  actorRef.current = options.actor;

  const tenantCatalog = useMemo(() => scenarioBlueprintByTenant(activeTenant), [activeTenant]);
  const tenantCatalogDigest = useMemo(() => buildCatalogDigest(activeTenant).digest, [activeTenant]);

  const plans = useMemo(() => buildScenarioRows(tenantCatalog), [tenantCatalog]);
  const scenarioCount = tenantCatalog.length;
  const selectedScenario = useMemo(
    () => tenantCatalog.find((entry) => entry.id === selectedScenarioId) ?? tenantCatalog[0],
    [tenantCatalog, selectedScenarioId],
  );

  const runQueue = useMemo(() => buildRunQueue(activeTenant, tenantCatalog), [activeTenant, tenantCatalog]);
  const telemetry = useMemo(() => computeTelemetry(runHistory, activeTenant), [runHistory, activeTenant]);

  const refreshAudit = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await collectTenantAudit(activeTenant, actorRef.current);
      setAudit(weightedAudit(payload));
    } finally {
      setLoading(false);
    }
  }, [activeTenant]);

  const seed = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(tenantCatalog);
      if (tenantCatalog.length > 0) {
        setSelectedScenarioId(tenantCatalog[0]?.id);
      }
      setSeeded(true);
      setPlanModeState('simulate');
      await refreshAudit();
    } finally {
      setLoading(false);
    }
  }, [refreshAudit, tenantCatalog]);

  const runSelected = useCallback(async (actor: string, includeDiagnostics: boolean) => {
    if (!selectedScenario) {
      return;
    }

    setLoading(true);
    try {
      const next = await runSingleScenario(selectedScenario, planMode, actor);
      const nextRun: ScenarioResultSet = {
        request: next.request,
        result: {
          ...next.result,
          summary: {
            ...next.result.summary,
            diagnostics: includeDiagnostics
              ? [...next.result.summary.diagnostics, ...`digest:${tenantCatalogDigest}`.split(':')]
              : ['diagnostics-hidden'],
            metadata: {
              ...next.result.summary.metadata,
              tenant: activeTenant,
            },
          },
          digest: `${tenantCatalogDigest}:${next.result.digest}`,
        },
      };
      setRunHistory((current) => [...current, nextRun]);
    } finally {
      setLoading(false);
    }
  }, [activeTenant, planMode, selectedScenario, tenantCatalogDigest]);

  const runAll = useCallback(async (actor: string) => {
    setLoading(true);
    try {
      const outputs = await runTenantPlans(activeTenant, actor, planMode);
      const withMetadata = outputs.map<ScenarioResultSet>((entry, index) => ({
        request: entry.request,
        result: {
          ...entry,
          summary: {
            ...entry.summary,
            metadata: {
              ...entry.summary.metadata,
              batchIndex: index,
              mode: planMode,
            },
          },
          digest: `${tenantCatalogDigest}:${index}:${entry.digest}`,
        },
      }));
      setRunHistory((current) => [...current, ...withMetadata]);
    } finally {
      setLoading(false);
    }
  }, [activeTenant, planMode, tenantCatalogDigest]);

  useEffect(() => {
    if (!seeded) {
      void seed();
    }
  }, [seed, seeded]);

  useEffect(() => {
    setCatalog(tenantCatalog);
  }, [tenantCatalog]);

  return {
    state: {
      tenants,
      activeTenant,
      catalog,
      plans,
      scenarioCount,
      selectedScenario,
      runHistory,
      planMode,
      scenarioDigest: tenantCatalogDigest,
      runQueue,
      audit: [...audit],
      telemetry,
      loading,
      seeded,
    },
    seed,
    selectTenant: setActiveTenant,
    selectScenario: setSelectedScenarioId,
    runSelected,
    runAll,
    refreshAudit,
    setPlanMode: setPlanModeState,
  };
};
