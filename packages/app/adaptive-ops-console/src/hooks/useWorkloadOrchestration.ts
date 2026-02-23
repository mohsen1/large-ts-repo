import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildDependencySeed,
  buildScenarioFromSeed,
  aggregateByScope,
  collectForecastInputs,
  createWorkloadRepository,
  computeHistory,
  projectToGraphNodes,
  summarizeRecords,
  toRowsByQuery,
  type ForecastInput,
  type WorkloadStoreQuery,
} from '@data/recovery-workload-store';
import {
  calculateCoverageForWindow,
  buildTopology,
  simulateWorkloadDrill,
  summarizeSignals,
  type WorkloadDependencyGraph,
} from '@domain/recovery-workload-intelligence';
import { createWorkloadOrchestrator, type WorkloadOrchestrator } from '@service/recovery-workload-orchestrator';

export interface WorkloadOrchestrationFilter {
  readonly tenantId: string;
  readonly region: 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'all';
  readonly showOnlyCritical: boolean;
}

export interface WorkloadOrchestrationState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly plans: number;
  readonly warnings: readonly string[];
  readonly coverage: number;
  readonly signals: readonly string[];
  readonly queue: readonly string[];
}

interface WorkloadHistory {
  readonly coverage: number;
  readonly snapshotCount: number;
  readonly alerts: number;
}

const defaultFilter: WorkloadOrchestrationFilter = {
  tenantId: 'tenant-a',
  region: 'all',
  showOnlyCritical: false,
};

const toStoredRecords = (rows: readonly ForecastInput[]) =>
  rows.map((input) => ({
    nodeId: input.node.id,
    node: input.node,
    snapshots: [input.snapshot],
    forecastHistory: [],
    lastPlan: undefined,
    updatedAt: input.snapshot.timestamp,
    createdAt: input.snapshot.timestamp,
  }));

export const useWorkloadOrchestration = (initial: WorkloadOrchestrationFilter = defaultFilter) => {
  const [filter, setFilter] = useState<WorkloadOrchestrationFilter>(initial);
  const [state, setState] = useState<WorkloadOrchestrationState>({
    loading: false,
    error: null,
    plans: 0,
    warnings: [],
    coverage: 0,
    signals: [],
    queue: [],
  });
  const [graph, setGraph] = useState<WorkloadDependencyGraph>(() => buildDependencySeed(initial.tenantId, 10));
  const [records, setRecords] = useState<readonly ForecastInput[]>(() => buildScenarioFromSeed(initial.tenantId, 14));
  const repository = createWorkloadRepository();

  const storedRecords = useMemo(() => toStoredRecords(records), [records]);
  const topology = useMemo(() => buildTopology(graph), [graph]);
  const viewRows = useMemo(() => toRowsByQuery(storedRecords), [storedRecords]);

  const history = useMemo<WorkloadHistory>(() => {
    const snapshotRows = records.map((input) => input.snapshot);
    const coverage = calculateCoverageForWindow(graph, snapshotRows);
    const flattened = computeHistory(storedRecords);
    return {
      coverage: coverage.overall,
      snapshotCount: flattened.totalSnapshots,
      alerts: flattened.totalSnapshots > 24 ? 4 : Math.floor(flattened.totalSnapshots / 2),
    };
  }, [graph, records, storedRecords]);

  const aggregateByScopeReport = useMemo(() => aggregateByScope(storedRecords), [storedRecords]);
  const recordSignals = useMemo(() => summarizeRecords(storedRecords), [storedRecords]);

  const setRegion = useCallback((region: WorkloadOrchestrationFilter['region']) => {
    setFilter((current) => ({ ...current, region }));
  }, []);

  const setCriticalOnly = useCallback((value: boolean) => {
    setFilter((current) => ({ ...current, showOnlyCritical: value }));
  }, []);

  const execute = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const filtered = records.filter((record) => filter.region === 'all' || record.node.region === filter.region);
    const simulation = simulateWorkloadDrill({
      snapshot: filtered,
      graph,
    });

    const seeded = await repository.buildFromInputs(filtered);
    const scenario = collectForecastInputs(seeded);
    const topologyGraph = projectToGraphNodes(scenario.length > 0 ? scenario : filtered);

    const query: WorkloadStoreQuery = {
      nodeIds: filter.region === 'all'
        ? []
        : records.filter((entry) => entry.node.region === filter.region).map((entry) => entry.node.id),
      includeDependencies: true,
      region: filter.region === 'all' ? undefined : filter.region,
    };

    const queryRows = await repository.query(query);
    const signalCount = filtered
      .map((entry) => summarizeSignals(entry.node, [entry.snapshot]))
      .map((signal) => signal.signalDensity)
      .reduce((acc, density) => acc + density, 0);

    const safeRepository = await repository.buildFromInputs(filtered);
    const orchestrator: WorkloadOrchestrator = createWorkloadOrchestrator({
      repository: {
        upsert: async (upsert) => repository.upsert(upsert),
        query: async () => safeRepository,
        getForecastSignal: async () => queryRows.flatMap((entry) => entry.forecastHistory),
        buildFromInputs: async () => safeRepository,
      },
      graph: topologyGraph,
      mode: 'simulate',
    });

    const forecast = await orchestrator.evaluate();
    const activeHistory = computeHistory(queryRows);
    if (!forecast.ok) {
      setState({
        loading: false,
        error: forecast.error,
        plans: 0,
        warnings: [],
        coverage: 0,
        signals: [],
        queue: [],
      });
      return;
    }

    const selected = simulation.plans
      .filter((plan) => (filter.showOnlyCritical ? plan.coverage < 0.5 : true))
      .map((plan) => `${plan.nodeId}:${plan.runId}`);

    setState({
      loading: false,
      error: null,
      plans: forecast.value.planGroups.length,
      warnings: [...forecast.value.warnings],
      coverage: activeHistory.totalSnapshots === 0 ? 0 : Math.min(1, signalCount / Math.max(1, activeHistory.totalSnapshots)),
      signals: selected,
      queue: simulation.queue,
    });
  }, [filter.region, filter.showOnlyCritical, graph, records, repository]);

  useEffect(() => {
    void repository.buildFromInputs(records);
  }, [repository, records]);

  const reload = useCallback(() => {
    setRecords(buildScenarioFromSeed(filter.tenantId, 14));
    setGraph(buildDependencySeed(filter.tenantId, 10));
  }, [filter.tenantId]);

  const setTenant = useCallback((tenantId: string) => {
    setFilter((current) => ({ ...current, tenantId }));
    setRecords(buildScenarioFromSeed(tenantId, 14));
    setGraph(buildDependencySeed(tenantId, 10));
  }, []);

  return {
    filter,
    state,
    viewRows,
    graph,
    topology,
    history,
    aggregateByScopeReport,
    recordSignals,
    setRegion,
    setCriticalOnly,
    execute,
    reload,
    setTenant,
  };
}
