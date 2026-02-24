import {
  aggregateSignalTotals,
  incidentId,
  runPlanId,
  emptyWindow,
  signalId,
  tenantId,
  type IncidentId,
  type TenantId,
  type RecoverySignal,
  type OrchestrationPlanInput,
} from '../domain/models';
import { asTuple } from '../domain/tuple-utils';
import { createEngine, type EngineResult, RecoveryOrchestrationEngine, executeEngine } from './orchestration-engine';

export interface PreparedPlan {
  readonly tenant: TenantId;
  readonly incident: IncidentId;
  readonly runId: string;
  readonly plan: OrchestrationPlanInput;
  readonly criticalSignals: number;
  readonly signalCount: number;
}

const baseSignals = (tenant: TenantId, incident: IncidentId): readonly RecoverySignal[] =>
  asTuple([
    {
      id: signalId('sig-critical'),
      tenant,
      incident,
        category: 'infra/compute',
        severity: 'critical',
        channel: 'telemetry',
        origin: 'edge-probe',
        detail: {
        code: 'telemetry:latency/p99',
        value: 0.91,
        tags: ['probe', 'critical'],
        metadata: { durationMs: 1200 } as Record<string, string | number | boolean>,
      },
    },
    {
      id: signalId('sig-high'),
      tenant,
      incident,
        category: 'control-plane/orchestrator',
        severity: 'high',
        channel: 'agent',
        origin: 'control-plane',
        detail: {
        code: 'agent:timeout/retry',
        value: 0.58,
        tags: ['agent', 'orchestrator'],
        metadata: { retryCount: 2 } as Record<string, string | number | boolean>,
      },
    },
    {
      id: signalId('sig-moderate'),
      tenant,
      incident,
        category: 'network/mesh',
        severity: 'moderate',
        channel: 'scheduler',
        origin: 'planner',
        detail: {
        code: 'scheduler:queue-delay/backlog',
        value: 0.45,
        tags: ['scheduler', 'mesh'],
        metadata: { position: 13 } as Record<string, string | number | boolean>,
      },
    },
  ]);

export const buildDemoPlan = (tenant: TenantId, title: string): PreparedPlan => {
  const incident = incidentId('incident-omega');
  const signals = baseSignals(tenant, incident);
  const totals = aggregateSignalTotals(signals);
  const planId = runPlanId(`${tenant}:plan:${Date.now()}`);

  return {
    tenant,
    incident,
    runId: planId,
    criticalSignals: totals.critical,
    signalCount: signals.length,
    plan: {
      runId: planId,
      tenant,
      incident,
      title,
      requestedAt: new Date().toISOString(),
      signals,
      window: emptyWindow(),
      metrics: {
        reliability: 0.98,
        throughput: 1.43,
        confidence: 0.9,
      },
    },
  };
};

export interface ExecutionSummary {
  readonly runId: string;
  readonly directiveCount: number;
  readonly directives: readonly string[];
  readonly timeline: readonly string[];
  readonly elapsedMs: number;
}

export const summarizeResult = (result: EngineResult): ExecutionSummary => {
  const { output, timeline } = result.snapshot;
  return {
    runId: output.runId,
    directiveCount: output.directives.length,
    directives: output.directives.map((entry) => entry.name),
    timeline: timeline.map((entry) => `${entry.plugin}:${entry.status}`),
    elapsedMs: result.elapsedMs,
  };
};

export const executePlan = async (
  engine: RecoveryOrchestrationEngine,
  tenant: TenantId,
  title: string,
): Promise<ExecutionSummary> => {
  const prepared = buildDemoPlan(tenant, title);
  const result = await executeEngine(engine, prepared.plan);
  return summarizeResult(result);
};

export const runDefaultPlan = async (tenant: TenantId, title: string): Promise<ExecutionSummary> => {
  const engine = createEngine(tenant);
  return executePlan(engine, tenant, title);
};
