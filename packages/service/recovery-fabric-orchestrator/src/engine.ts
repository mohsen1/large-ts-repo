import {
  type FabricSimulationInput,
  FabricPlanner,
  type PlannerOptions,
  type PlannerResult,
  generateWhatIfSignals,
  simulateSignalReplay,
  type SimulationRunbook,
} from '@domain/recovery-ops-fabric';
import { RecoveryOpsFabricStore } from '@data/recovery-ops-fabric-store';

export interface FabricEngine {
  run(input: FabricSimulationInput, options: PlannerOptions): PlannerResult;
  replay(input: FabricSimulationInput): SimulationRunbook;
}

export class RecoveryOpsFabricEngine implements FabricEngine {
  constructor(
    private readonly store: RecoveryOpsFabricStore,
    private readonly planner: FabricPlanner,
  ) {}

  run(input: FabricSimulationInput, options: PlannerOptions): PlannerResult {
    const result = this.planner.createPlan(
      {
        topology: input.topology,
      },
      {
        baselineDemand: options.baselineDemand,
        targetReliability: options.targetReliability,
        horizonMinutes: options.horizonMinutes,
      },
      input.signals,
    );

    this.store.saveSimulation(result.simulation);
    return {
      ...result,
      simulation: result.simulation,
    };
  }

  replay(input: FabricSimulationInput): SimulationRunbook {
    const whatif = generateWhatIfSignals(input.signals);
    const withWhatIf = {
      ...input,
      signals: whatif,
    };
    return simulateSignalReplay(withWhatIf);
  }
}

export const createEngine = (store: RecoveryOpsFabricStore, input: FabricSimulationInput): RecoveryOpsFabricEngine => {
  return new RecoveryOpsFabricEngine(
    store,
    new FabricPlanner({
      topology: input.topology,
      constraint: { maxSkewMs: 500, maxRisk: 0.55, minHeadroom: 0.1 },
    }),
  );
}
