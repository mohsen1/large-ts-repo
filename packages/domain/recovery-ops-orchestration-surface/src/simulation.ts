import type {
  CommandExecutionDependency,
  CommandOrchestrationResult,
  CommandSurface,
  CommandWave,
  CommandPlanProfile,
} from './types';

export interface SimulationWaveState {
  readonly waveId: string;
  readonly commandCount: number;
  readonly startedAt: string;
  readonly etaAt: string;
  readonly parallelism: number;
  readonly blockers: readonly CommandExecutionDependency[];
}

export interface SimulationTimeline {
  readonly surfaceId: string;
  readonly planId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly waves: readonly SimulationWaveState[];
}

const resolvePlan = (result: CommandOrchestrationResult): CommandPlanProfile | undefined => {
  return result.surface.availablePlans.find((plan) => plan.id === result.chosenPlanId);
};

const toMinutes = (value: string): number => {
  return new Date(value).getTime() / 1000 / 60;
};

const waveState = (index: number, wave: CommandWave, seed: number): SimulationWaveState => {
  const durationOffset = Math.max(1, (wave.expectedDurationMinutes * ((seed % 7) + 0.5)) / 2);
  const startedAt = new Date(Date.now() + (index * 60 + durationOffset) * 60_000).toISOString();
  const etaAt = new Date(Date.now() + (index * 60 + durationOffset + wave.expectedDurationMinutes) * 60_000).toISOString();

  return {
    waveId: wave.id,
    commandCount: wave.steps.length,
    startedAt,
    etaAt,
    parallelism: wave.parallelism,
    blockers: [...wave.steps.flatMap((step) => step.dependencies)],
  };
};

export const simulateExecution = (
  _surface: CommandSurface,
  result: CommandOrchestrationResult,
): SimulationTimeline => {
  const seed = (result.score + result.riskScore + toMinutes(result.projectedCompletionAt)).toFixed(0);
  const chosenPlan = resolvePlan(result) ?? result.surface.availablePlans[0];

  if (!chosenPlan) {
    return {
      surfaceId: result.surface.id,
      planId: result.chosenPlanId,
      startAt: new Date().toISOString(),
      endAt: result.projectedCompletionAt,
      waves: [],
    };
  }

  const seedNumber = Number.parseInt(seed, 10);
  const waves = chosenPlan.waves.map((wave, index) => waveState(index, wave, Number.isNaN(seedNumber) ? index : seedNumber));

  return {
    surfaceId: result.surface.id,
    planId: chosenPlan.id,
    startAt: waves.length ? waves[0].startedAt : new Date().toISOString(),
    endAt: waves.length ? waves[waves.length - 1].etaAt : result.projectedCompletionAt,
    waves,
  };
}
