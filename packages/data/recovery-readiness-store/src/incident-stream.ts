import type { ReadinessReadModel, RunIndex } from './models';
import type { ReadinessSignal, RecoveryReadinessPlan, ReadinessRunId, ReadinessDirective } from '@domain/recovery-readiness';
import { evaluateRiskEnvelope, type ReadinessRiskEnvelope } from '@domain/recovery-readiness';
import { mapImpactSignals, impactHeatmap, reconcileForecast } from '@domain/recovery-readiness'
export interface ReadinessIncidentEvent {
  readonly streamId: string;
  readonly runId: ReadinessRunId;
  readonly emittedAt: string;
  readonly type: 'create' | 'update' | 'suppression';
  readonly payload: {
    readonly plan: RecoveryReadinessPlan;
    readonly signalCount: number;
    readonly risk: ReadinessRiskEnvelope;
    readonly hotTargets: number;
  };
}

export interface EventStreamDigest {
  readonly streamId: string;
  readonly events: readonly ReadinessIncidentEvent[];
  readonly scoreByRun: Map<string, number>;
  readonly activeRunIds: ReadonlyArray<ReadinessRunId>;
}

export function buildIncidentStream(models: readonly ReadinessReadModel[]): EventStreamDigest {
  const streamId = `stream:${Date.now()}`;

  const events: ReadinessIncidentEvent[] = [];
  const scoreByRun = new Map<string, number>();
  const activeRunIds: ReadonlyArray<ReadinessRunId> = models
    .filter((model) => model.plan.state === 'active')
    .map((model) => model.plan.runId);

  for (const model of models) {
    const impact = impactHeatmap(model.signals, model.directives as unknown as ReadinessDirective[]);
    const forecast = reconcileForecast(
      { runId: model.plan.runId, horizonMinutes: 40, projectedSignals: [], confidence: 0.42 },
      model.plan,
    );

    const envelope = evaluateRiskEnvelope(model.signals);
    const riskValue = envelope.totalScore + mapImpactSignals(model.signals, model.directives as unknown as ReadinessDirective[]).summary.forecastConfidence;

    scoreByRun.set(model.plan.runId, riskValue);

    events.push({
      streamId,
      runId: model.plan.runId,
      emittedAt: new Date().toISOString(),
      type: model.plan.state === 'active' ? 'create' : model.plan.state === 'suppressed' ? 'suppression' : 'update',
      payload: {
        plan: model.plan,
        signalCount: model.signals.length,
        risk: envelope,
        hotTargets: impact.length + mapImpactSignals(model.signals, model.directives as unknown as ReadinessDirective[]).summary.activeDirectives,
      },
    });

    const eventForTemplate: RunIndex = {
      runId: model.plan.runId,
      planId: model.plan.planId,
      state: model.plan.state,
      riskBand: model.plan.riskBand,
      owner: model.plan.metadata.owner,
      tags: model.plan.metadata.tags,
    };

    void eventForTemplate;
    void forecast;
  }

  return {
    streamId,
    events,
    scoreByRun,
    activeRunIds,
  };
}

export function projectSignalsToSignalMap(models: readonly ReadinessReadModel[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const model of models) {
    for (const signal of model.signals) {
      const key = `${signal.runId}:${signal.targetId}`;
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}

export function activeEventsDigest(models: readonly ReadinessReadModel[]): string {
  const active = models.filter((model) => model.plan.state === 'active');
  const runTotals = new Map<ReadinessRunId, number>();
  for (const model of active) {
    const total = (runTotals.get(model.plan.runId) ?? 0) + model.signals.length;
    runTotals.set(model.plan.runId, total);
  }

  return JSON.stringify({
    total: active.length,
    signalSum: active.reduce((sum, model) => sum + model.signals.length, 0),
    tops: Object.fromEntries(Array.from(runTotals.entries())),
  });
}
