import {
  type OrchestratorState,
  type OrchestrationInput,
  type SimulationOutput,
} from './types';
import {
  type ScenarioPlan,
  type SimulationFrame,
  type SimulationResult,
  type ScenarioConstraint,
  type CommandId,
  type ScenarioCommand,
  asScenarioPlanId,
  asSimulationFrameId,
  asSimulationId,
  asPercent,
} from '@domain/recovery-scenario-lens';

interface SimulationClock {
  now(): number;
}

class VirtualClock implements SimulationClock {
  private current = Date.now();

  now(): number {
    return this.current;
  }

  tick(ms: number): number {
    this.current += ms;
    return this.current;
  }
}

const resolveFrames = (
  clock: SimulationClock,
  commands: readonly ScenarioCommand[],
  constraints: readonly ScenarioConstraint[],
): readonly SimulationFrame[] => {
  const maxParallelism = constraints
    .filter((constraint) => constraint.type === 'max_parallelism')
    .reduce((acc, constraint) => Math.min(acc, constraint.limit), Number.MAX_SAFE_INTEGER);

  const frames: SimulationFrame[] = [];
  let cursor = clock.now();
  let lane = 0;

  for (const command of commands) {
    const start = cursor + lane * 100;
    const finish = start + command.estimatedDurationMs;
    const frame: SimulationFrame = {
      frameId: asSimulationFrameId(`${String(command.commandId)}-${String(start)}`),
      commandId: command.commandId,
      planId: asScenarioPlanId('plan-timeline'),
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date(finish).toISOString(),
      blockedBy: command.prerequisites,
      state: 'completed',
      exitCode: 0,
      events: [`parallelism:${Math.min(maxParallelism, command.estimatedDurationMs)}`, `blast:${command.blastRadius}`],
    };
    frames.push(frame);
    cursor = finish;
    lane = (lane + 1) % Math.max(1, maxParallelism);
  }

  return frames;
};

export const runSimulation = (input: OrchestrationInput, state: OrchestratorState, plan: ScenarioPlan): SimulationOutput => {
  const commandMap = new Map<CommandId, ScenarioCommand>();
  for (const command of input.blueprint.commands) {
    commandMap.set(command.commandId, command);
  }

  const commands = plan.commandIds
    .map((commandId) => commandMap.get(commandId))
    .filter((command): command is ScenarioCommand => command !== undefined);

  const clock = new VirtualClock();
  const constraints = state.currentRun?.model.activePlan?.constraints ?? [];
  const frames = resolveFrames(clock, commands, constraints);

  const simulation: SimulationResult = {
    simulationId: asSimulationId(`simulation-${String(plan.planId)}`),
    planId: plan.planId,
    scenarioId: input.blueprint.scenarioId,
    startedAt: new Date(clock.now()).toISOString(),
    finishedAt: new Date(clock.now() + 1000).toISOString(),
    frames,
    violations: constraints,
    riskScore: Math.max(0, 1 - frames.length / 100),
    confidence: asPercent(0.91),
    logs: [
      `plan:${String(plan.planId)}`,
      `frames:${frames.length}`,
      `constraints:${constraints.length}`,
    ],
  };

  return {
    plan,
    simulation,
    timelineFrames: frames,
    violations: constraints.map((violation) => violation.constraintId),
  };
};
