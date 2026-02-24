import { Result, fail, ok } from '@shared/result';
import { createOrchestrator } from '@service/fulfillment-planner';
import { ForecastRequest, buildForecast, composeScenarioPlan, summarizeForecastWindow } from '@domain/fulfillment-orchestration-analytics';
import { InMemoryFulfillmentTelemetryStore } from '@data/fulfillment-telemetry-store';
import { InMemoryFulfillmentHubStore } from '@data/fulfillment-hub';
import { makeAllocation, summarizeAllocation } from '@domain/fulfillment-orchestration-analytics';
import { validateForecastIntent } from './planner';
import { OrchestrationRequest, OrchestrationRunId, OrchestrationResult } from './types';
import { collectPolicySignals } from '@service/fulfillment-planner';
import { classifyRisk, makeSignalsForSignals, deriveInterventions, aggregatePlanScore } from './analyzer';

export interface FulfillmentIntelligenceOrchestrator {
  run(request: OrchestrationRequest): Promise<Result<OrchestrationResult>>;
}

interface OrchestratorDeps {
  forecastStore?: InMemoryFulfillmentTelemetryStore;
}

export class FulfillmentIntelligenceOrchestratorImpl implements FulfillmentIntelligenceOrchestrator {
  private readonly telemetryStore: InMemoryFulfillmentTelemetryStore;
  private readonly planner = createOrchestrator(new InMemoryFulfillmentHubStore());

  constructor(deps: OrchestratorDeps = {}) {
    this.telemetryStore = deps.forecastStore ?? new InMemoryFulfillmentTelemetryStore();
  }

  async run(request: OrchestrationRequest): Promise<Result<OrchestrationResult>> {
    const runId = `${request.tenantId}-${Date.now()}` as OrchestrationRunId;
    const validate = validateForecastIntent({
      tenantId: request.tenantId,
      strategy: 'baseline',
      minimumCoverage: request.targetSla,
      horizonMinutes: request.windows.length * 15,
    });

    if (!validate.ok) {
      return fail(new Error(`invalid request: ${validate.error}`));
    }

    const planInput: ForecastRequest = {
      tenantId: request.tenantId,
      productId: request.productId,
      signals: request.signals,
      intent: {
        tenantId: request.tenantId,
        horizonMinutes: request.windows.length * 15,
        strategy: 'baseline',
        minimumCoverage: request.targetSla,
        sla: [
          {
            metric: 'ttr',
            thresholdMs: 900_000,
            graceWindowMs: 120_000,
            penaltyPerBreachedRun: 42,
          },
        ],
      },
    };

    const history = await this.telemetryStore.createRun(request.tenantId);
    if (!history.ok) return fail(history.error);
    const runHistory = history.value;
    const forecast = buildForecast(planInput);
    const allocation = makeAllocation(
      {
        tenantId: request.tenantId,
        demandSignals: request.signals,
        windows: forecast.windows,
        intent: {
          tenantId: request.tenantId,
          horizonMinutes: planInput.intent.horizonMinutes,
          strategy: request.targetSla > 0.9 ? 'preposition' : 'baseline',
          minimumCoverage: request.targetSla,
          sla: planInput.intent.sla,
        },
      },
      forecast,
    );
    const scenario = allocation.scenarioPlan?.scenario ?? {
      id: 'fallback' as any,
      tenantId: request.tenantId,
      demandProfile: request.signals,
      windows: forecast.windows,
      strategy: request.targetSla > 0.9 ? 'preposition' : 'burst',
      score: 20,
      recommendation: 'fallback plan',
    };
    const plan = composeScenarioPlan(scenario, forecast.windows, planInput.intent);
    const score = aggregatePlanScore(plan.windows, request.targetSla);
    const risk = classifyRisk(plan);

    const orchestrationResult: OrchestrationResult = {
      runId,
      status: classifyRisk(plan) === 'critical' ? 'degraded' : 'completed',
      plan,
      topScenario: allocation.scenarioPlan?.scenario,
      score,
    };

    const topAllocation = allocation.topPick ? summarizeAllocation(allocation.topPick) : 'none';
    const signals = collectPolicySignals({
      runId: runHistory.runId as any,
      planId: `${runHistory.runId}-plan` as any,
      status: 'running',
      traceId: `${runHistory.runId}-trace` as any,
      startedAt: new Date().toISOString(),
    });
    await this.telemetryStore.recordWindow(runHistory.runId, {
      windowId: `${runHistory.runId}:baseline` as any,
      tenantId: request.tenantId,
      strategy: plan.selectedStrategies[0] ?? 'baseline',
      demandUnits: forecast.windows.reduce((acc, value) => acc + value.forecastUnits, 0),
      backlogUnits: plan.riskBudget,
      workerUtilization: Math.min(120, score * 1.2),
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
    });
    await this.telemetryStore.recordAlert(runHistory.runId, {
      tenantId: request.tenantId,
      severity: risk === 'critical' ? 'critical' : risk === 'high' ? 'warning' : 'info',
      metric: 'ttr',
      message: summarizeForecastWindow(forecast.windows),
    });
    await this.telemetryStore.recordWindow(runHistory.runId, {
      windowId: runHistory.runId as any,
      tenantId: request.tenantId,
      strategy: plan.selectedStrategies[1] ?? 'burst',
      demandUnits: forecast.windows.length,
      backlogUnits: plan.slaTargets.length,
      workerUtilization: score,
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
    });

    void makeSignalsForSignals(request.signals);
    void deriveInterventions(plan);
    void topAllocation;
    return ok(orchestrationResult);
  }
}

export const createFulfillmentIntelligenceOrchestrator = (
  deps?: OrchestratorDeps,
): FulfillmentIntelligenceOrchestrator => new FulfillmentIntelligenceOrchestratorImpl(deps);
