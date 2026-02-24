import type { IncidentLabScenario, IncidentLabPlan, IncidentLabRun, IncidentLabSignal, IncidentLabEnvelope } from '@domain/recovery-incident-lab-core';
import {
  buildSimulationTimeline,
  inferRisk,
  summarizeSignalTrends,
  createPlanId,
} from '@domain/recovery-incident-lab-core';
import {
  compileRiskBands,
  computePlanRisk,
  type PlanRiskScore,
} from '@domain/recovery-incident-lab-core';
import type { RecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';
import { appendPlanSaved, appendRunSaved, appendSignalIngested, createInMemoryScenarioEventSink } from '@data/recovery-incident-lab-store';
import { createOrchestratedRun, type OrchestratedRun, computeAttemptPlan, summarizeRun } from '@domain/recovery-incident-lab-core';
import { createClock } from '@domain/recovery-incident-lab-core';

export interface PipelineConfig {
  readonly maxParallelism: number;
  readonly burstSize: number;
  readonly jitterPercent: number;
  readonly throughput: number;
}

export interface PipelineInput {
  readonly scenario: IncidentLabScenario;
  readonly plan: IncidentLabPlan;
  readonly config: PipelineConfig;
}

export interface PipelineOutput {
  readonly plan: IncidentLabPlan;
  readonly run: IncidentLabRun;
  readonly telemetry: readonly IncidentLabEnvelope<IncidentLabSignal>[];
  readonly risk: PlanRiskScore;
  readonly orchestration: OrchestratedRun;
}

const createSignalTimeline = (input: PipelineInput): readonly IncidentLabSignal[] =>
  buildSimulationTimeline(input.scenario, input.plan.queue, {
    stepsPerMinute: Math.max(1, input.config.throughput),
    jitterPercent: input.config.jitterPercent,
  }).flatMap((record) => record.signals);

export const runPipeline = async (
  input: PipelineInput,
  repository: RecoveryIncidentLabRepository,
): Promise<PipelineOutput> => {
  const timeline = createSignalTimeline(input);
  const now = createClock().now();
  const runId = `${input.scenario.id}:pipeline:${Date.now()}` as IncidentLabRun['runId'];

  const orchestration = createOrchestratedRun(input.plan, 'executing');
  const events = createInMemoryScenarioEventSink();

  const run: IncidentLabRun = {
    runId,
    planId: createPlanId(input.scenario.id),
    scenarioId: input.scenario.id,
    startedAt: now,
    state: 'active',
    results: input.plan.queue.map((stepId, index) => ({
      stepId,
      startAt: now,
      finishAt: new Date(Date.now() + input.config.burstSize * index).toISOString(),
      status: index % 5 === 0 ? 'failed' : 'done',
      logs: [`index=${index}`],
    sideEffects: ['pipeline', inferRisk({
        runId,
        at: now,
        vector: { throughput: 0, latencyMs: 0, integrityScore: 0 },
        signals: [],
      })],
    })),
  };

  const risk = computePlanRisk(input.scenario, timeline, input.plan);
  const signalSummary = summarizeSignalTrends(timeline);
  const _bands = compileRiskBands(timeline);

  const telemetry = timeline.map((signal) => ({
    id: `${run.runId}:telemetry:${signal.node}:${signal.kind}` as IncidentLabEnvelope['id'],
    labId: input.scenario.labId,
    scenarioId: input.scenario.id,
    payload: signal,
    createdAt: createClock().now(),
    origin: 'pipeline',
  }));

  const state: OrchestratedRun = {
    ...orchestration,
    run,
    stepAttempts: computeAttemptPlan(input.plan, input.config.maxParallelism),
    stage: 'verified',
  };

  await repository.saveRun(run);
  appendPlanSaved(events, run, 'pipeline');
  appendRunSaved(events, run, 'pipeline');
  for (const signal of timeline) {
    appendSignalIngested(events, signal, 'pipeline');
  }

  await repository.appendEnvelope(telemetry[0] as IncidentLabEnvelope);
  await repository.saveScenario(input.scenario);

  const summary = summarizeRun(run);
  const summarySignal = [...signalSummary].map((item) => `${item.kind}:${item.average}`).join(',');
  void summary;
  void summarySignal;
  void state;
  return {
    plan: input.plan,
    run,
    telemetry,
    risk,
    orchestration: state,
  };
};
