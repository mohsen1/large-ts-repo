import type { ScenarioBlueprint, ScenarioConstraint, ScenarioPlan, ScenarioReadModel, ScenarioSignal, SimulationResult } from './types';

export interface ScenarioReader {
  getBlueprint(scenarioId: string): Promise<ScenarioBlueprint>;
  getSignals(scenarioId: string): Promise<readonly ScenarioSignal[]>;
}

export interface SimulationRepository {
  saveSimulation(simulation: SimulationResult): Promise<void>;
  listSimulations(scenarioId: string): Promise<readonly SimulationResult[]>;
}

export interface PlanRepository {
  savePlan(plan: ScenarioPlan): Promise<void>;
  getPlan(planId: string): Promise<ScenarioPlan | undefined>;
  getLatest(scenarioId: string): Promise<ScenarioPlan | undefined>;
}

export interface ReadModelSink {
  publish(model: ScenarioReadModel): Promise<void>;
}

export interface ScenarioAdapterBundle {
  readonly reader: ScenarioReader;
  readonly simulationRepository: SimulationRepository;
  readonly planRepository: PlanRepository;
  readonly readModelSink: ReadModelSink;
  readonly constraints: (scenarioId: string) => Promise<readonly ScenarioConstraint[]>;
}
