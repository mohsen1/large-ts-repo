import { randomUUID } from 'node:crypto';
import { type NoInfer } from '@shared/type-level';
import { isOk } from '@shared/result';
import {
  buildLatticeIntent,
  buildLatticeRun,
  routeDigest,
  type LatticeSummary,
} from '@domain/recovery-stress-lab';
import {
  collectForecasts,
  summarizeRecommendations,
  type ForecastSummary,
} from '@domain/recovery-stress-lab-intelligence';
import {
  buildRunEnvelope,
  type LatticeRunEnvelope,
  type LatticeRunRecordId,
  type LatticeSessionId,
  type LatticeSessionRecord,
  type LatticeStoreQuery,
  type LatticeRecordStore,
  MemoryStressLabOrchestrationStore,
} from '@data/recovery-stress-lab-orchestration-store';
import { withBrand, type Edge, type NodeId } from '@shared/core';
import {
  createSignalId,
  createTenantId,
  type CommandRunbook,
  type OrchestrationPlan,
  type RecoverySignal,
  type RecoverySimulationResult,
  type SeverityBand,
  type TenantId,
  type WorkloadTarget,
  type WorkloadTopology,
  type StageSignal,
} from '@domain/recovery-stress-lab';

const bootstrapDefaults = await (async () => {
  const maxSnapshots = Number(process.env.RECOVERY_STRESS_LAB_ORCHESTRATION_MAX_SNAPSHOTS ?? 240);
  const flushIntervalMs = Number(process.env.RECOVERY_STRESS_LAB_ORCHESTRATION_FLUSH_MS ?? 25);

  return {
    maxSnapshots: Number.isFinite(maxSnapshots) ? Math.max(8, Math.min(2_000, Math.floor(maxSnapshots))) : 240,
    flushIntervalMs: Number.isFinite(flushIntervalMs) ? Math.max(5, Math.floor(flushIntervalMs)) : 25,
  };
})();

const iteratorFrom =
  (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { map<U>(transform: (value: T) => U): { toArray(): U[] } } } }).Iterator?.from;

const severityScore = (band: SeverityBand): number =>
  band === 'critical' ? 0.98 : band === 'high' ? 0.82 : band === 'medium' ? 0.54 : 0.22;

export interface StressLabOrchestratorInput {
  readonly tenantId: TenantId;
  readonly runbook: CommandRunbook;
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
  readonly snapshotEnabled?: boolean;
  readonly store?: LatticeRecordStore;
}

export interface StressLabOrchestratorReport {
  readonly tenantId: TenantId;
  readonly sessionId: LatticeSessionId;
  readonly planDigest: string;
  readonly forecast: ForecastSummary;
  readonly recommendationCount: number;
  readonly recommendations: readonly ReturnType<typeof summarizeRecommendations>[number][];
  readonly summary: LatticeSummary;
  readonly plan: OrchestrationPlan;
  readonly simulation: RecoverySimulationResult;
  readonly envelope: LatticeRunEnvelope;
  readonly route: string;
}

interface StressLabOrchestrator {
  execute: () => Promise<LatticeRunEnvelope>;
  store: LatticeRecordStore;
}

const makeRecordId = (tenantId: TenantId): LatticeRunRecordId => withBrand(`${tenantId}::record::${Date.now()}`, 'LatticeRunRecordId');
const makeSessionId = (tenantId: TenantId): LatticeSessionId =>
  withBrand(`${tenantId}::session::${Date.now()}::${randomUUID()}`, 'LatticeSessionId');

const toStageSignals = (tenantId: TenantId, signals: readonly RecoverySignal[]): readonly StageSignal[] =>
  signals
    .toSorted((left, right) => severityScore(right.severity) - severityScore(left.severity))
    .map((signal, index) => ({
      signal: createSignalId(`${tenantId}::signal::${signal.id}::${index}`),
      tenantId,
      signalClass: signal.class,
      severity: signal.severity,
      score: severityScore(signal.severity),
      createdAt: Date.now() - index * 15,
      source: `signal:${signal.id}`,
    }));

const buildPlan = (input: StressLabOrchestratorInput): OrchestrationPlan => {
  const criticalityMap = new Map<NodeId, number>(input.topology.nodes.map((node) => [node.id as NodeId, node.criticality]));
  const dependencies: { readonly nodes: readonly NodeId[]; readonly edges: readonly Edge<NodeId, { fromCriticality: number; toCriticality: number }>[] } = {
    nodes: input.topology.nodes.map((node) => node.id),
    edges: input.topology.edges.map((edge) => ({
      from: edge.from as NodeId,
      to: edge.to as NodeId,
      weight: edge.coupling,
      payload: {
        fromCriticality: criticalityMap.get(edge.from as NodeId) ?? 0,
        toCriticality: criticalityMap.get(edge.to as NodeId) ?? 0,
      },
    })),
  };

  return {
    tenantId: input.tenantId,
    scenarioName: `${input.runbook.id}`,
    schedule: [],
    runbooks: [input.runbook],
    dependencies,
    estimatedCompletionMinutes: Math.max(1, input.topology.nodes.length + input.signals.length),
  };
};

const buildSimulation = (input: StressLabOrchestratorInput): RecoverySimulationResult => {
  const severity = toSeverityBuckets(input.signals);
  const sorted = input.signals.toSorted((left, right) => severityScore(right.severity) - severityScore(left.severity));

  return {
    tenantId: input.tenantId,
    startedAt: new Date().toISOString(),
    endedAt: new Date(Date.now() + sorted.length * 200).toISOString(),
    selectedRunbooks: [input.runbook.id],
    ticks: sorted.map((signal, index) => ({
      timestamp: new Date(Date.now() + index * 1000).toISOString(),
      activeWorkloads: Math.max(1, index + 1),
      blockedWorkloads: [],
      confidence: severityScore(signal.severity),
    })),
    riskScore: (severity.critical * 0.5 + severity.high * 0.3 + severity.medium * 0.15 + severity.low * 0.05) / Math.max(1, input.signals.length),
    slaCompliance: 1 - Math.max(0, input.signals.length - 3) * 0.01,
    notes: [input.runbook.id, String(input.topology.nodes.length)],
  };
};

const toSeverityBuckets = (signals: readonly RecoverySignal[]) =>
  signals.reduce<Record<SeverityBand, number>>(
    (acc, signal) => ({ ...acc, [signal.severity]: acc[signal.severity] + 1 }),
    { low: 0, medium: 0, high: 0, critical: 0 },
  );

const createSnapshots = (tenantId: TenantId, count: number) => {
  const safeCount = Math.max(1, Math.min(count, bootstrapDefaults.maxSnapshots));
  return [...Array(safeCount).keys()].map((index) => ({
    snapshotId: withBrand(`${tenantId}::snapshot::${index}`, 'LatticeSnapshotId'),
    timestamp: new Date(Date.now() + index * 250).toISOString(),
    metric: `${tenantId}::forecast::${index % 4}::score` as const,
    value: index === 0 ? 1 : Math.max(0, 1 - index * 0.015),
    context: {
      route: [],
      workload: [],
      activeTargets: index + 1,
    },
  }));
};

export const createStressLabOrchestrator = (input: StressLabOrchestratorInput): StressLabOrchestrator => {
  const store = input.store ?? MemoryStressLabOrchestrationStore.create(String(input.tenantId));
  const sessionId = makeSessionId(input.tenantId);

  const execute = async (): Promise<LatticeRunEnvelope> => {
    const plan = buildPlan(input);
    const simulation = buildSimulation(input);
    const latticeRun = buildLatticeRun(input.tenantId, plan, simulation, input.signals);
    const intent = buildLatticeIntent(
      {
        tenantId: input.tenantId,
        plan,
        simulation,
        signals: input.signals,
        targets: input.targets,
      },
      input.topology,
    );

    const sessionRecord: LatticeSessionRecord = {
      recordId: makeRecordId(input.tenantId),
      sessionId,
      tenantId: input.tenantId,
      plan,
      simulation,
      signals: input.signals,
      targets: input.targets,
      status: 'running',
      metadata: {
        tenantId: input.tenantId,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        runName: intent.routeKey,
        tags: [String(plan.scenarioName), String(intent.summary.signalCount)],
      },
    };

    const upserted = await store.upsertSession(sessionRecord);
    if (isOk(upserted)) {
      if (input.snapshotEnabled ?? true) {
        const snapshots =
          iteratorFrom?.(createSnapshots(input.tenantId, 4))?.map((snapshot) => snapshot)?.toArray() ??
          createSnapshots(input.tenantId, 4);
        await store.appendSnapshots(sessionRecord.sessionId, snapshots);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, bootstrapDefaults.flushIntervalMs));

    const complete = {
      ...sessionRecord,
      status: 'completed' as const,
      metadata: {
        ...sessionRecord.metadata,
        finishedAt: new Date().toISOString(),
      },
    };

    await store.upsertSession(complete);
    const hydrated = await store.hydrateEnvelope(sessionId);
    if (isOk(hydrated)) {
      return hydrated.value;
    }

    return buildRunEnvelope(complete, []);
  };

  return { execute, store };
};

export const runOrchestrator = async <TSignals extends readonly RecoverySignal[]>(
  input: StressLabOrchestratorInput,
): Promise<StressLabOrchestratorReport> => {
  const tenantId = createTenantId(String(input.tenantId));
  const orchestrator = createStressLabOrchestrator({
    tenantId,
    runbook: input.runbook,
    topology: input.topology,
    signals: input.signals,
    targets: input.targets,
    snapshotEnabled: input.snapshotEnabled,
    store: input.store,
  });

  const envelope = await orchestrator.execute();
  const plan = buildPlan({ ...input, tenantId });
  const simulation = buildSimulation({ ...input, tenantId });
  const intent = buildLatticeIntent(
    {
      tenantId,
      plan,
      simulation,
      signals: input.signals as NoInfer<TSignals>,
      targets: input.targets,
    },
    input.topology,
  );

  const forecast = await collectForecasts(toStageSignals(tenantId, input.signals), tenantId);
  const total = forecast.length;
  const values = total === 0 ? [0] : forecast.map((point) => point.forecast);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const normalized: ForecastSummary = {
    tenantId,
    total,
    average,
    min,
    max,
    points: forecast,
  };

  const recommendations = summarizeRecommendations(normalized);

  return {
    tenantId,
    sessionId: envelope.sessionId,
    planDigest: plan.scenarioName,
    forecast: normalized,
    recommendationCount: recommendations.length,
    recommendations,
    summary: intent.summary,
    plan,
    simulation,
    envelope,
    route: routeDigest(tenantId, 'run', plan.scenarioName),
  };
};

export const queryOrchestratorSessions = async (
  store: LatticeRecordStore,
  query: LatticeStoreQuery,
): Promise<readonly LatticeSessionRecord[]> => {
  return store.listSessions(query);
};
