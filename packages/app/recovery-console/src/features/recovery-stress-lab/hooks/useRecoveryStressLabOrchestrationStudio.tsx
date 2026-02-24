import { useCallback, useMemo, useState } from 'react';
import {
  createRunbookId,
  createStepId,
  createSignalId,
  createTenantId,
  createWorkloadId,
  type CommandRunbook,
  type OrchestrationPlan,
  type RecoverySimulationResult,
  type RecoverySignal,
  type WorkloadTopology,
  type WorkloadTarget,
} from '@domain/recovery-stress-lab';
import {
  type StressLabOrchestratorReport,
  type StressLabIntelligenceOrchestrateResult,
  type StressLabIntelligenceOrchestratorConfig,
  collectStressLabIntelligence,
  queryOrchestratorSessions,
  runOrchestrator,
} from '@service/recovery-stress-lab-orchestrator';
import {
  LatticeStoreQuery,
  LatticeRunEnvelope,
  LatticeSessionRecord,
  MemoryStressLabOrchestrationStore,
} from '@data/recovery-stress-lab-orchestration-store';

const sampleTenant = createTenantId('studio-tenant-orchestrator');

const demoRunbook: CommandRunbook = {
  id: createRunbookId('studio-orchestrator-runbook'),
  tenantId: sampleTenant,
  name: 'Studio orchestration template',
  description: 'Signal-driven topology stress orchestration',
  steps: [
    {
      commandId: createStepId('studio-step-observe'),
      title: 'Observe cross-signal dependencies',
      phase: 'observe',
      estimatedMinutes: 20,
      prerequisites: [],
      requiredSignals: [createSignalId('studio-observe')],
    },
    {
      commandId: createStepId('studio-step-isolate'),
      title: 'Isolate at-risk topology edges',
      phase: 'isolate',
      prerequisites: [createStepId('studio-step-observe')],
      estimatedMinutes: 35,
      requiredSignals: [createSignalId('studio-isolate')],
    },
    {
      commandId: createStepId('studio-step-restore'),
      title: 'Restore steady-state checks',
      phase: 'restore',
      prerequisites: [createStepId('studio-step-isolate')],
      estimatedMinutes: 25,
      requiredSignals: [createSignalId('studio-restore')],
    },
  ],
  ownerTeam: 'platform',
  cadence: {
    weekday: 5,
    windowStartMinute: 300,
    windowEndMinute: 480,
  },
};

const sampleTopology: WorkloadTopology = {
  tenantId: sampleTenant,
  nodes: [
    {
      id: createWorkloadId('studio-node-api'),
      name: 'api-gateway',
      ownerTeam: 'platform',
      criticality: 5,
      active: true,
    },
    {
      id: createWorkloadId('studio-node-worker'),
      name: 'worker',
      ownerTeam: 'platform',
      criticality: 4,
      active: true,
    },
    {
      id: createWorkloadId('studio-node-events'),
      name: 'events',
      ownerTeam: 'ops',
      criticality: 3,
      active: true,
    },
  ],
  edges: [
    {
      from: createWorkloadId('studio-node-api'),
      to: createWorkloadId('studio-node-worker'),
      coupling: 0.95,
      reason: 'request flow',
    },
    {
      from: createWorkloadId('studio-node-worker'),
      to: createWorkloadId('studio-node-events'),
      coupling: 0.67,
      reason: 'work dispatch',
    },
  ],
};

const sampleSignals: readonly RecoverySignal[] = [
  {
    id: createSignalId('studio-sig-gw-high'),
    class: 'availability',
    severity: 'high',
    title: 'gateway latency rise',
    createdAt: new Date().toISOString(),
    metadata: {
      source: 'studio',
      impact: 'latency',
    },
  },
  {
    id: createSignalId('studio-sig-queue'),
    class: 'performance',
    severity: 'critical',
    title: 'queue lag acceleration',
    createdAt: new Date().toISOString(),
    metadata: {
      source: 'studio',
      impact: 'throughput',
    },
  },
];

export interface StressLabStudioModel {
  readonly tenantId: string;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly report: StressLabOrchestratorReport | null;
  readonly intelligence: StressLabIntelligenceOrchestrateResult | null;
  readonly sessions: readonly LatticeRunEnvelope[];
  readonly status: 'idle' | 'running' | 'ready' | 'error';
  readonly lastError: string | null;
}

const emptyPlan: OrchestrationPlan = {
  tenantId: sampleTenant,
  scenarioName: 'empty',
  schedule: [],
  runbooks: [],
  dependencies: { nodes: [], edges: [] },
  estimatedCompletionMinutes: 0,
};

const emptySimulation: RecoverySimulationResult = {
  tenantId: sampleTenant,
  startedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  selectedRunbooks: [],
  ticks: [],
  riskScore: 0,
  slaCompliance: 0,
  notes: ['bootstrap'],
};

const createStore = (tenantId: string) => MemoryStressLabOrchestrationStore.create(tenantId);

export const useRecoveryStressLabOrchestrationStudio = () => {
  const [tenantId] = useState(() => sampleTenant);
  const [plan, setPlan] = useState<OrchestrationPlan>(emptyPlan);
  const [simulation, setSimulation] = useState<RecoverySimulationResult>(emptySimulation);
  const [report, setReport] = useState<StressLabOrchestratorReport | null>(null);
  const [intelligence, setIntelligence] = useState<StressLabIntelligenceOrchestrateResult | null>(null);
  const [sessions, setSessions] = useState<readonly LatticeRunEnvelope[]>([]);
  const [status, setStatus] = useState<StressLabStudioModel['status']>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [store] = useState(() => createStore(String(sampleTenant)));

  const config = useMemo<StressLabIntelligenceOrchestratorConfig>(
    () => ({
      tenantId: String(sampleTenant),
      runName: `${String(sampleTenant)}-${Date.now()}`,
      maxRecommendations: 5,
    }),
    [],
  );

  const hydrate = useCallback(async () => {
    setStatus('running');
    setLastError(null);

    try {
      const latest = await runOrchestrator({
        tenantId,
        runbook: demoRunbook,
        topology: sampleTopology,
        signals: sampleSignals,
        targets: [] as readonly WorkloadTarget[],
        store,
      });

      const intelligenceResult = await collectStressLabIntelligence(
        config,
        latest.plan,
        latest.simulation,
      );

      const forecast = latest.forecast;
      const recommendations = latest.recommendations;

      const query: LatticeStoreQuery = {
        tenantId,
        limit: 16,
        runStatus: ['completed', 'running'],
      };
      const history = await queryOrchestratorSessions(store, query);
      const hydrated = await Promise.all(
        history.map(async (entry: LatticeSessionRecord) => {
          const hydratedEnvelope = await store.hydrateEnvelope(entry.sessionId);
          return hydratedEnvelope.ok ? hydratedEnvelope.value : null;
        }),
      );

      setReport(latest);
      setIntelligence(intelligenceResult);
      setPlan(latest.plan);
      setSimulation(latest.simulation);
      setSessions(
        hydrated
          .filter((entry): entry is LatticeRunEnvelope => entry != null)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
      setStatus('ready');
      return { forecast, recommendations };
    } catch (cause) {
      setLastError(cause instanceof Error ? cause.message : 'orchestration failed');
      setStatus('error');
      throw cause;
    }
  }, [tenantId, config, store]);

  const reset = useCallback(() => {
    setStatus('idle');
    setLastError(null);
    setPlan(emptyPlan);
    setSimulation(emptySimulation);
    setReport(null);
    setIntelligence(null);
    setSessions([]);
  }, []);

  const topRecommendationCount = useMemo(() => (report ? report.recommendationCount : 0), [report]);
  const routeCount = useMemo(
    () => sessions.reduce((count, session) => count + session.snapshots.length, 0),
    [sessions],
  );

  return {
    tenantId: String(tenantId),
    status,
    plan,
    simulation,
    report,
    intelligence,
    sessions,
    lastError,
    routeCount,
    topRecommendationCount,
    hydrate,
    reset,
    config,
  };
};
