import type { MeshPriority, MeshPolicy, MeshPhase, MeshTopology, MeshWave } from './mesh-types';

export interface PolicyTune {
  readonly inputSignals: readonly number[];
  readonly targetPhase: MeshPhase;
  readonly targetConcurrency: MeshPriority;
}

export type PolicySignature<T extends MeshPolicy = MeshPolicy> = {
  readonly [K in keyof T]: T[K];
};

export type PolicyPhaseWindow<TPolicy extends MeshPolicy> = {
  readonly [K in keyof TPolicy['phaseGating']]: `${K & string}=${TPolicy['phaseGating'][K] extends true ? 'on' : 'off'}`;
}[keyof TPolicy['phaseGating']];

export const clampPriority = (input: number): MeshPriority =>
  (input >= 5 ? 5 : input <= 0 ? 0 : Math.round(input)) as MeshPriority;

export const phasePressure = (topology: MeshTopology): number =>
  topology.edges.length / Math.max(1, topology.nodes.length) + topology.nodes.filter((node) => !node.active).length;

export const tunePolicy = (policy: MeshPolicy, pressure: number, waves: readonly MeshWave[]): PolicyTune => {
  const scale = Math.max(1, waves.length);
  const targetPhase = waves.length > 0 ? ('execute' as const) : ('plan' as const);
  return {
    inputSignals: waves.flatMap((wave) => [wave.commandIds.length, wave.nodes.length]),
    targetPhase,
    targetConcurrency: clampPriority(Math.min(5, policy.maxConcurrency + pressure / scale)),
  };
};

export const applyPolicyTune = (policy: MeshPolicy, tune: PolicyTune): MeshPolicy => {
  const nextGating = Object.fromEntries(
    (Object.keys(policy.phaseGating) as MeshPhase[]).map((phase) => [phase, phase === tune.targetPhase || policy.phaseGating[phase]]),
  ) as MeshPolicy['phaseGating'];

  return {
    ...policy,
    maxConcurrency: tune.targetConcurrency,
    phaseGating: nextGating,
  };
};

export const policySignature = (policy: MeshPolicy): PolicySignature<MeshPolicy> => ({
  id: policy.id,
  maxConcurrency: policy.maxConcurrency,
  allowPause: policy.allowPause,
  allowWarnings: policy.allowWarnings,
  pluginIds: policy.pluginIds,
  phaseGating: { ...policy.phaseGating },
});

export const policyPhaseWindow = (policy: MeshPolicy): readonly PolicyPhaseWindow<MeshPolicy>[] =>
  (Object.keys(policy.phaseGating) as MeshPhase[]).map(
    (phase) => `${phase}=${policy.phaseGating[phase] ? 'on' : 'off'}` as PolicyPhaseWindow<MeshPolicy>,
  );

export const buildPolicyFromTopology = (policy: MeshPolicy, topology: MeshTopology, waves: readonly MeshWave[]): MeshPolicy => {
  const pressure = phasePressure(topology);
  const tune = tunePolicy(policy, pressure, waves);
  const next = applyPolicyTune(policy, tune);
  return {
    ...next,
    pluginIds: next.pluginIds.toSorted().toSorted(),
  };
};
