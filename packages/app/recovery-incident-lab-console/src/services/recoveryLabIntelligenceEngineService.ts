import {
  runIntelligencePlan,
  type ServiceRequest,
  type ServiceRunEnvelope,
} from '@domain/recovery-lab-intelligence-core';
import {
  collectPluginEvents,
  type PluginEvent,
} from '@shared/stress-lab-runtime';
import type { SignalEvent } from '@domain/recovery-lab-intelligence-core';
import type {
  StrategyMode,
  StrategyLane,
  StrategyPlan,
  StrategyResult,
  StrategyTuple,
} from '@domain/recovery-lab-intelligence-core';
import { createOperationPlan, collectOperationMetrics, planSequence, type OperationRun } from '@domain/recovery-lab-intelligence-core';

export interface LabIntelligenceRunRequest {
  readonly workspace: string;
  readonly scenario: string;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly seed: Record<string, unknown>;
}

export interface LabIntelligenceRunResponse<TPayload = unknown> {
  readonly runId: string;
  readonly request: ServiceRequest<Record<string, unknown>>;
  readonly result: StrategyResult<TPayload>;
  readonly plan: StrategyPlan;
  readonly events: readonly SignalEvent[];
  readonly metrics: {
    readonly durationMs: number;
    readonly eventCount: number;
    readonly warningCount: number;
    readonly criticalCount: number;
    readonly score: number;
  };
}

export interface LabIntelligenceBatchRun {
  readonly runs: readonly OperationRun[];
  readonly metrics: ReturnType<typeof collectOperationMetrics>;
}

export const runLabIntelligenceScenario = async <TPayload extends Record<string, unknown> = Record<string, unknown>>(
  request: LabIntelligenceRunRequest,
): Promise<LabIntelligenceRunResponse<TPayload>> => {
  const startedAt = Date.now();
  const requestPayload: ServiceRequest<Record<string, unknown>> = {
    workspace: request.workspace,
    scenario: request.scenario,
    mode: request.mode,
    lane: request.lane,
    seed: request.seed,
    tuple: [request.mode, request.lane, request.scenario, request.scenario.length] as StrategyTuple,
  };

  const response = await runIntelligencePlan<Record<string, unknown>, TPayload>(requestPayload);
  const endedAt = Date.now();
  const warningCount = response.result.warnings.length;
  const criticalCount = response.result.events.filter((entry) => entry.severity === 'critical' || entry.severity === 'fatal').length;

  return {
    runId: response.result.runId,
    request: response.request,
    result: response.result,
    plan: response.plan,
    events: response.result.events,
    metrics: {
      durationMs: endedAt - startedAt,
      eventCount: response.result.events.length,
      warningCount,
      criticalCount,
      score: response.result.score,
    },
  };
};

export const runLabIntelligenceBatch = async (workspace: string, scenario: string): Promise<LabIntelligenceBatchRun> => {
  const runs = [
    { workspace, scenario, lane: 'forecast', mode: 'simulate', seed: { seed: 1 } },
    { workspace, scenario, lane: 'resilience', mode: 'analyze', seed: { seed: 2 } },
    { workspace, scenario, lane: 'recovery', mode: 'plan', seed: { seed: 3 } },
  ] as const;

  const responses = await Promise.all(
    runs.map((entry) =>
      runLabIntelligenceScenario<Record<string, unknown>>({
        ...entry,
      }),
    ),
  );
  const metrics = collectOperationMetrics(
    responses.map((response, index) => ({
      request: {
        workspace,
        scenario: `${scenario}-${index}`,
        mode: response.request.mode,
        lane: response.request.lane,
        seed: response.request.seed,
        tuple: response.request.tuple,
      },
      telemetry: response.result.events,
      result: response.result as StrategyResult,
      plan: response.plan,
      timing: {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: response.metrics.durationMs,
      },
    })),
  );
  return {
    runs: responses as unknown as readonly OperationRun[],
    metrics,
  };
};

export const buildLabIntelligencePlan = async (
  workspace: string,
  scenario: string,
): Promise<{
  readonly plan: StrategyPlan;
  readonly nextSeed: string;
}> => {
  const plan = await createOperationPlan({
    workspace,
    scenario,
    lane: 'containment',
    mode: 'simulate',
    seed: {
      createdBy: 'app',
      tags: ['intelligence', 'lab-console'],
    },
  });
  return {
    plan: plan.plan,
    nextSeed: `${scenario}:${plan.tuple[1]}:${plan.tuple[0]}`,
  };
};

export const renderPluginEvents = (events: readonly SignalEvent[]): readonly PluginEvent[] => {
  const records = collectPluginEvents(events as never);
  const rows: PluginEvent[] = [];
  for (const event of records) {
    rows.push({
      ...event,
      metadata: {
        ...event.metadata,
        from: 'recovery-lab-intelligence-core',
      },
    });
  }
  return rows.toReversed().toReversed().slice();
};
