import type { OrchestratorDependencies, OrchestratorInput, OrchestratorOutput, OrchestratorConfig, OrchestratorStatus } from './types';
import { runSimulation, draftPlanForScenario } from './controller';
import { runPipeline, type PipelineConfig, type PipelineInput, type PipelineOutput } from './pipeline';
import type { RecoveryIncidentLabRepository as LabRepository } from '@data/recovery-incident-lab-store';
import { createClock, estimatePlanId, validateScenario, type IncidentLabScenario, type IncidentLabSignal } from '@domain/recovery-incident-lab-core';
import { summarizeRun, summarizeSignals } from './insights';
import { summarizeSignalTrends } from '@domain/recovery-incident-lab-core';
import { toScenarioDigest } from './adapters';

export type Stage = 'boot' | 'plan' | 'simulate' | 'pipeline' | 'review';

interface StageResult {
  readonly stage: Stage;
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly planId?: string;
  readonly note: string;
}

export interface CoordinatorInput {
  readonly scenario: IncidentLabScenario;
  readonly mode: 'simulation' | 'pipeline';
  readonly options?: Partial<PipelineConfig>;
}

export interface CoordinatorState {
  readonly stage: Stage;
  readonly createdAt: string;
  readonly notes: readonly string[];
  readonly output?: OrchestratorOutput | PipelineOutput;
}

const asConfig = (input: OrchestratorInput['config'], overrides: Partial<PipelineConfig>): PipelineConfig => ({
  maxParallelism: 3,
  burstSize: input.sampleIntervalMs,
  jitterPercent: input.jitterPercent,
  throughput: input.targetThroughput,
  ...overrides,
});

const summarizeSignalsForCoordinator = (signals: readonly IncidentLabSignal[]): string =>
  summarizeSignalTrends(signals).map((item) => `${item.kind}:${item.average}`).join('|');

export const coordinateRun = async (
  repository: LabRepository,
  input: CoordinatorInput,
  config: OrchestratorConfig,
  dependencies: OrchestratorDependencies,
): Promise<CoordinatorState> => {
  const validation = validateScenario(input.scenario);
  if (!validation.ok) {
    throw new Error(`invalid scenario: ${validation.issues.join(',')}`);
  }

  const plan = draftPlanForScenario(input.scenario);
  const notes: string[] = [
    `coordinator boot at ${createClock().now()}`,
    `scenario ${input.scenario.id}`,
    `plan ${estimatePlanId(input.scenario.id)}`,
  ];

  await repository.savePlan(plan);
  const baseState: CoordinatorState = {
    stage: 'boot',
    createdAt: createClock().now(),
    notes,
  };

  if (input.mode === 'simulation') {
    const runInput: OrchestratorInput = {
      scenario: input.scenario,
      plan,
      config,
    };
    const output = await runSimulation(runInput, dependencies);
    const insight = summarizeRun(output.run);
    const signalText = summarizeSignalsForCoordinator(
      output.telemetry.map((item) => item.payload).filter((item): item is IncidentLabSignal => item != null),
    );
    const stage: StageResult = {
      stage: 'simulate',
      status: output.run.state === 'active' ? 'ok' : 'failed',
      planId: output.plan.id,
      note: `${insight.completed}/${insight.total}`,
    };
    return { ...baseState, stage: stage.stage, notes: [...notes, stage.note, signalText], output };
  }

  const pipelineInput: PipelineInput = {
    scenario: input.scenario,
    plan,
    config: asConfig(config, input.options ?? {}),
  };
  const output = await runPipeline(pipelineInput, repository);
  const reviewSummary = summarizeSignals(output.run.results.flatMap((result) =>
    result.logs.map((raw) => ({
      kind: 'capacity',
      node: String(result.stepId),
      value: String(raw).length,
      at: result.startAt,
    }))),
  );
  const stage: StageResult = {
    stage: 'pipeline',
    status: 'ok',
    planId: output.plan.id,
    note: `risk=${output.risk.score} telemetry=${output.telemetry.length} max=${reviewSummary.max} avg=${reviewSummary.avg} digest=${toScenarioDigest(input.scenario)}`,
  };
  return { ...baseState, stage: stage.stage, notes: [...notes, stage.note], output };
};

export const buildCoordinatorStatus = (state: CoordinatorState, executed: number): OrchestratorStatus => {
  return {
    state: state.output ? 'running' : 'idle',
    startedAt: state.createdAt,
    executed,
  } as OrchestratorStatus;
};

export const replayCoordinatorNotes = (state: CoordinatorState): readonly string[] => [...state.notes];

export const nextStage = (current: Stage): Stage => {
  if (current === 'boot') return 'plan';
  if (current === 'plan') return 'simulate';
  if (current === 'simulate') return 'pipeline';
  if (current === 'pipeline') return 'review';
  return 'review';
};
