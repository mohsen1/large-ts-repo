import {
  asNamespace,
  asRunToken,
  asScenarioId,
  asSimulationId,
  type ChaosRunToken,
  type ChaosScenarioId,
  type ChaosSimNamespace,
  type ChaosSimulationId
} from '@domain/recovery-chaos-sim-models';

const bootstrapSeed = [
  {
    namespace: 'recovery:ops',
    simulationId: '11111111-1111-1111-1111-111111111111',
    scenarioId: '22222222-2222-2222-2222-222222222222',
    mode: 'baseline' as const,
    parallelism: 2,
    allowDryRun: true
  },
  {
    namespace: 'recovery:ops',
    simulationId: '33333333-3333-3333-3333-333333333333',
    scenarioId: '44444444-4444-4444-4444-444444444444',
    mode: 'storm' as const,
    parallelism: 8,
    allowDryRun: false
  },
  {
    namespace: 'recovery:ops',
    simulationId: '55555555-5555-5555-5555-555555555555',
    scenarioId: '66666666-6666-6666-6666-666666666666',
    mode: 'blackout' as const,
    parallelism: 16,
    allowDryRun: false
  }
] as const;

const bootstrapProfiles = Promise.all(
  bootstrapSeed.map(async (profile) => {
    if (profile.namespace.length < 3 || profile.simulationId.length < 8 || profile.scenarioId.length < 8) {
      throw new Error('invalid bootstrap profile');
    }
    return {
      namespace: asNamespace(profile.namespace),
      simulationId: asSimulationId(profile.simulationId),
      scenarioId: asScenarioId(profile.scenarioId),
      mode: profile.mode,
      parallelism: profile.parallelism,
      allowDryRun: profile.allowDryRun
    };
  })
);

export interface BootstrapPlan {
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly scenarioId: ChaosScenarioId;
  readonly runToken: ChaosRunToken;
  readonly mode: 'baseline' | 'storm' | 'blackout';
  readonly parallelism: number;
  readonly allowDryRun: boolean;
}

type SeedProfile = Awaited<typeof bootstrapProfiles>[number];

export type BootstrapPlanRecord = SeedProfile & {
  namespace: ChaosSimNamespace;
  simulationId: ChaosSimulationId;
  scenarioId: ChaosScenarioId;
  runToken: ChaosRunToken;
};

export async function pickBootstrapPlan(index: number): Promise<BootstrapPlanRecord> {
  const plan = (await bootstrapProfiles)[index % bootstrapSeed.length] as BootstrapPlanRecord;
  return {
    ...plan,
    runToken: asRunToken(`${plan.namespace}-${plan.simulationId}:${plan.scenarioId}`)
  };
}

export const bootstrapConfig = {
  defaultIndex: 0,
  availableModes: ['baseline', 'storm', 'blackout'] as const
} satisfies {
  defaultIndex: number;
  availableModes: readonly [string, ...string[]];
};
