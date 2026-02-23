import { useMemo, useRef, useState } from 'react';
import { RecoveryScenarioEngine } from '@service/recovery-incident-scenario-orchestrator';
import type { ServiceInput, ServiceEvent } from '@service/recovery-incident-scenario-orchestrator';
import type {
  IncidentEnvelope,
  RecoveryBlueprint,
  RecoverySignal,
} from '@domain/recovery-scenario-orchestration';
import type {
  UseScenarioOrchestratorInput,
  ScenarioWorkspace,
  ScenarioEvent,
} from '../../types/scenario-dashboard/incidentScenarioWorkspace';

const nowSeconds = (): string => new Date().toISOString();

const makeSignals = (): readonly RecoverySignal[] => {
  return [
    {
      id: `${Date.now()}:s1` as any,
      tenantId: 'tenant-critical' as any,
      incidentId: 'tenant-critical:incident' as any,
      metric: 'latency',
      value: Math.round(20 + Math.random() * 40),
      unit: 'ms',
      observedAt: new Date().toISOString(),
      dimensions: { source: 'simulator' },
    },
    {
      id: `${Date.now()}:s2` as any,
      tenantId: 'tenant-critical' as any,
      incidentId: 'tenant-critical:incident' as any,
      metric: 'error-rate',
      value: Math.round(Math.random() * 100),
      unit: 'pct',
      observedAt: new Date().toISOString(),
      dimensions: { source: 'simulator' },
    },
  ];
};

const classify = (score: number): string =>
  score >= 0.8 ? 'High confidence' : score >= 0.6 ? 'Manual approval needed' : 'Collect more evidence';

const baselineWorkspace = (tenantId: string, scenarioId: string): ScenarioWorkspace => ({
  id: `${tenantId}:${scenarioId}`,
  tenantId,
  scenarioId,
  mode: 'live',
  plan: null,
  runs: [],
  signals: [],
  constraintCount: 0,
  blockingCount: 0,
  healthScore: 0,
  updatedAt: nowSeconds(),
  active: false,
});

const healthFromSignals = (signals: readonly RecoverySignal[]): number => {
  const latestScore = signals.reduce((acc, signal) => acc + signal.value, 0) / Math.max(signals.length, 1);
  return Math.max(0, 100 - Math.round(latestScore));
};

const normalizeWorkspaceEventType = (event: ServiceEvent): ScenarioEvent['type'] => {
  if (event.type === 'plan_created') {
    return 'plan';
  }
  if (event.type === 'run_updated') {
    return 'run';
  }
  if (event.type === 'plan_promoted' || event.type === 'command_acked') {
    return 'constraint';
  }
  return 'signal';
};

const buildScenarioEvent = (type: ScenarioEvent['type'], payload: Record<string, unknown>): ScenarioEvent => ({
  id: `${type}-${Date.now()}`,
  type,
  at: nowSeconds(),
  title: `service-${type}`,
  detail: JSON.stringify(payload),
});

export const useScenarioPlanEngine = (input: UseScenarioOrchestratorInput) => {
  const engineRef = useRef(new RecoveryScenarioEngine('dashboard-actor'));
  const [workspace, setWorkspace] = useState<ScenarioWorkspace>(baselineWorkspace(input.tenantId, input.scenarioId));
  const [events, setEvents] = useState<readonly ScenarioEvent[]>([]);

  engineRef.current.subscribe('dashboard', (event) => {
    setEvents((existing) => [
      {
        id: `${event.timestamp}-${event.correlationId}`,
        type: normalizeWorkspaceEventType(event),
        at: event.timestamp,
        title: `${event.type.toUpperCase()} / ${event.correlationId}`,
        detail: JSON.stringify(event.payload),
      },
      ...existing,
    ]);
  });

  const signals = useMemo(() => makeSignals(), []);

  const constraints = useMemo(() => {
    return signals.map((signal, index) => ({
      id: `${signal.metric}:${index}`,
      key: signal.metric,
      state: index === 0 ? ('met' as const) : ('violated' as const),
      score: signal.value / 100,
    }));
  }, [signals]);

  const run = async (incident: IncidentEnvelope, blueprint: RecoveryBlueprint) => {
    const payload: ServiceInput = {
      tenantId: input.tenantId as any,
      scenarioId: input.scenarioId as any,
      incident,
      blueprint,
      actorId: 'dashboard-actor',
      signals,
    };

    const result = engineRef.current.run({ input: payload, signals }, []);
    const state = engineRef.current.getState();

    setWorkspace((existing) => ({
      ...existing,
      active: result.canRun,
      healthScore: healthFromSignals(signals),
      runs: state.runs ?? [],
      plan: state.activePlan,
      constraintCount: constraints.length,
      blockingCount: result.canRun ? 0 : 1,
      updatedAt: nowSeconds(),
      signals,
    }));

    setEvents((existing) => [
      buildScenarioEvent('plan', {
        scenarioId: blueprint.scenarioId,
        canRun: result.canRun,
        confidence: result.confidence,
      }),
      ...existing,
    ]);

    return result;
  };

  return {
    workspace,
    events,
    constraints,
    run,
  };
};

export const classifyConstraint = (score: number): string => classify(score);
