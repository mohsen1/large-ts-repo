import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RecoveryPlan,
  RecoveryAction,
  DomainVersion,
  PlanId,
  toTimestamp,
  EntityId,
  Region,
  ServiceCode,
  RecoveryBlueprint,
} from '@domain/recovery-cockpit-models';
import {
  RecoveryBlueprintOrchestrator,
  type BlueprintExecutionSummary,
} from '@service/recovery-cockpit-orchestrator';
import { type BlueprintCatalogSnapshot } from '@data/recovery-cockpit-store';

type BlueprintMode = 'analysis' | 'simulate' | 'execute' | 'verify';

const namespaceFromSeed = (seed: string): string => seed.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

const newAction = (seed: string, index: number): RecoveryAction => ({
  id: `action-${seed}-${index}` as EntityId,
  serviceCode: `svc-${index}` as ServiceCode,
  region: `region-${index}` as Region,
  command: `restore-service-${index}`,
  desiredState: 'up',
  dependencies: [],
  expectedDurationMinutes: 4 + index,
  retriesAllowed: 2,
  tags: ['simulate', index % 2 === 0 ? 'critical' : 'policy', 'signal'],
});

const buildPlan = (index: number, namespace: string): RecoveryPlan => {
  const actionCount = ((index % 4) + 2);
  const actions = Array.from({ length: actionCount }, (_, i) => newAction(`p${index}`, i)).toSorted((a, b) =>
    a.id.localeCompare(b.id),
  );
  const planSeed = namespaceFromSeed(`plan-${namespace}-${index}`);

  return {
    planId: `seed:${planSeed}:${index}` as PlanId,
    labels: {
      short: `Seed ${index}`,
      long: `Synthetic plan ${index}`,
      emoji: '🧩',
      labels: ['seed', planSeed],
    },
    mode: 'automated',
    title: `Seeded plan ${index}`,
    description: `Synthetic orchestration seed ${index}`,
    actions,
    audit: [],
    slaMinutes: 12,
    isSafe: true,
    version: 1 as DomainVersion,
    effectiveAt: toTimestamp(new Date(Date.now() - index * 40_000)),
  };
};

const seedPlans = (seedSize: number, namespace: string): readonly RecoveryPlan[] =>
  Array.from({ length: Math.max(1, Math.min(seedSize, 12)) }, (_, index) => buildPlan(index + 1, namespace));

const pickPlanForBlueprint = (plans: readonly RecoveryPlan[], blueprint: RecoveryBlueprint): RecoveryPlan => {
  const fromCatalog = plans.find((plan) => plan.planId === blueprint.planId);
  if (fromCatalog) {
    return fromCatalog;
  }

  const fallbackPlan = buildPlan(1, `${blueprint.planId}`);
  return {
    ...fallbackPlan,
    planId: blueprint.planId,
    labels: {
      ...fallbackPlan.labels,
      short: `Replay ${blueprint.blueprintId}`,
      long: blueprint.steps[0]?.name ?? fallbackPlan.labels.long,
    },
    title: `Replay ${blueprint.blueprintId}`,
  };
};

const toSnapshotText = (value: BlueprintExecutionSummary | null): string =>
  value === null ? 'No run yet' : `Completed ${value.planId} / ${value.artifactCount} artifacts`;

export type UseBlueprintOrchestratorState = {
  readonly plans: readonly RecoveryPlan[];
  readonly blueprints: readonly RecoveryBlueprint[];
  readonly selectedPlanId: PlanId;
  readonly selectedBlueprintId: string;
  readonly blueprintTrace: readonly string[];
  readonly catalogSnapshot: BlueprintCatalogSnapshot | null;
  readonly statusText: string;
  readonly running: boolean;
  readonly executing: boolean;
  readonly lastRun: BlueprintExecutionSummary | null;
  readonly lastRunSummary: string;
};

export type UseBlueprintOrchestratorActions = {
  seedCatalog(seedSize: number): Promise<void>;
  hydrate(): Promise<void>;
  runPlan(planId: PlanId, mode: BlueprintMode): Promise<void>;
  refreshSnapshot(): Promise<void>;
  selectPlan(planId: string): void;
  selectBlueprint(blueprintId: RecoveryBlueprint['blueprintId']): void;
  queueRun(blueprint: RecoveryBlueprint, mode: BlueprintMode): Promise<void>;
};

const toQuery = (namespace: string): BlueprintCatalogQuery => ({
  namespace: namespaceFromSeed(namespace),
});

export const useBlueprintOrchestrator = (
  namespace = 'recovery-cockpit',
): UseBlueprintOrchestratorState & UseBlueprintOrchestratorActions => {
  const [plans, setPlans] = useState<readonly RecoveryPlan[]>(seedPlans(4, namespace));
  const [blueprints, setBlueprints] = useState<readonly RecoveryBlueprint[]>([]);
  const [catalogSnapshot, setCatalogSnapshot] = useState<BlueprintCatalogSnapshot | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(plans[0]?.planId ?? ('' as PlanId));
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');
  const [statusText, setStatusText] = useState('Idle');
  const [running, setRunning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lastRun, setLastRun] = useState<BlueprintExecutionSummary | null>(null);
  const [trace, setTrace] = useState<readonly string[]>([]);

  const orchestrator = useMemo(
    () => new RecoveryBlueprintOrchestrator({ namespace, maxAttempts: 2 }),
    [namespace],
  );

  const hydrateBlueprints = useCallback(async () => {
    const result = await orchestrator.listBlueprints(toQuery(namespace));
    if (!result.ok) {
      setStatusText(`Catalog read failed: ${result.error}`);
      return;
    }

    const nextBlueprints = result.value.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
    setBlueprints(nextBlueprints);
    if (!selectedBlueprintId && nextBlueprints.length > 0) {
      setSelectedBlueprintId(nextBlueprints[0].blueprintId);
    }
    setCatalogSnapshot(orchestrator.snapshot());
  }, [namespace, orchestrator, selectedBlueprintId]);

  const hydrate = useCallback(async () => {
    setRunning(true);
    await hydrateBlueprints();
    setRunning(false);
    setStatusText(`Hydrated ${plans.length} plans`);
  }, [plans.length, hydrateBlueprints]);

  const seedCatalog = useCallback(async (seedSize: number): Promise<void> => {
    const generated = seedPlans(seedSize, namespace);
    const merged = [...generated, ...plans].reduce<RecoveryPlan[]>((acc, plan) => {
      if (acc.some((candidate) => candidate.planId === plan.planId)) {
        return acc;
      }
      return [...acc, plan];
    }, []);
    const normalized = merged.toSorted((left, right) => left.planId.localeCompare(right.planId));
    setPlans(normalized);
    setSelectedPlanId(normalized[0]?.planId ?? ('' as PlanId));
    setStatusText(`Seeded with ${normalized.length} plans`);
    await hydrateBlueprints();
  }, [plans, namespace, hydrateBlueprints]);

  const refreshSnapshot = useCallback(async () => {
    setCatalogSnapshot(orchestrator.snapshot());
  }, [orchestrator]);

  const runPlan = useCallback(async (planId: PlanId, mode: BlueprintMode): Promise<void> => {
    const target = plans.find((value) => value.planId === planId);
    if (!target) {
      setStatusText(`Missing plan ${planId}`);
      return;
    }

    setExecuting(true);
    const runId = `manual:${Date.now()}`;
    setTrace((value) => [...value, runId, `plan:${target.planId}:${mode}`]);

    const result = await orchestrator.execute(target, mode);
    if (!result.ok) {
      setExecuting(false);
      setStatusText(`Run failed: ${result.error}`);
      return;
    }

    setExecuting(false);
    setLastRun(result.value.summary);
    setStatusText(`Completed ${result.value.summary.planId}`);
    await hydrateBlueprints();
  }, [plans, orchestrator, hydrateBlueprints]);

  const queueRun = useCallback(async (blueprint: RecoveryBlueprint, mode: BlueprintMode): Promise<void> => {
    const replayPlan = pickPlanForBlueprint(plans, blueprint);
    if (blueprint.steps.length === 0) {
      setStatusText('No executable steps in blueprint');
      return;
    }

    const result = await orchestrator.execute(replayPlan, mode);
    if (!result.ok) {
      setStatusText(`Queue replay failed: ${result.error}`);
      return;
    }

    setLastRun(result.value.summary);
    await hydrateBlueprints();
  }, [plans, orchestrator, hydrateBlueprints]);

  const selectPlan = useCallback((planId: PlanId) => {
    setSelectedPlanId(planId);
  }, []);

  const selectBlueprint = useCallback((blueprintId: RecoveryBlueprint['blueprintId']) => {
    setSelectedBlueprintId(blueprintId);
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    plans,
    blueprints,
    selectedPlanId,
    selectedBlueprintId,
    blueprintTrace: trace,
    catalogSnapshot,
    statusText,
    running,
    executing,
    lastRun,
    lastRunSummary: toSnapshotText(lastRun),
    seedCatalog,
    hydrate,
    runPlan,
    refreshSnapshot,
    selectPlan,
    selectBlueprint,
    queueRun,
  };
};
type BlueprintCatalogQuery = {
  readonly namespace?: string;
  readonly status?: RecoveryBlueprint['status'];
  readonly planId?: RecoveryPlan['planId'];
  readonly minRisk?: number;
  readonly maxRisk?: number;
  readonly limit?: number;
};
