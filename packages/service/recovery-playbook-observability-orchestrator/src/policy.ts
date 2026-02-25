import {
  observabilityDefaults,
  type ObservabilityPolicy,
} from '@domain/recovery-playbook-observability-core';

export interface ObservabilityRuntimePolicy extends ObservabilityPolicy {
  readonly enableForecast: boolean;
  readonly topologicalDepth: 4 | 5 | 6 | 7 | 8;
  readonly pluginWeightDecay: number;
}

type PolicySeed = Pick<ObservabilityPolicy, 'name' | 'windowMs' | 'maxEventSpan' | 'requireCorrelation' | 'allowedScopes'>;

const buildRuntimePolicy = (): ObservabilityRuntimePolicy => {
  const defaults = observabilityDefaults.policy;
  const runtimeDefaults = {
    name: defaults.name,
    windowMs: defaults.windowMs,
    maxEventSpan: defaults.maxEventSpan,
    requireCorrelation: defaults.requireCorrelation,
    allowedScopes: defaults.allowedScopes,
  } satisfies PolicySeed;

  return {
    ...runtimeDefaults,
    enableForecast: true,
    topologicalDepth: 7,
    pluginWeightDecay: 0.91,
  };
};

export const defaultObservabilityPolicy: ObservabilityRuntimePolicy = buildRuntimePolicy();
