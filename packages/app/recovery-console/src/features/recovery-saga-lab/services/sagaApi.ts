import {
  parseScenarioBundle,
  parseScenarioPolicy,
  parseScenarioRun,
  type ParsedScenarioPolicy,
  type ParsedScenarioRun,
  type ScenarioBundle,
} from '@domain/recovery-incident-saga';
import { createSagaRuntime, type SagaRuntimeConfig, type SagaRuntimeSnapshot } from '@service/recovery-incident-saga-orchestrator';
import { NoInfer, type Result } from '@shared/type-level';
import type { ScenarioBundle as SagaScenarioBundle } from '@domain/recovery-incident-saga';

const fetcher = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return response.json();
};

export const loadSeedScenario = async (): Promise<ScenarioBundle> => {
  const payload = await fetcher('/api/recovery-saga/seed');
  return parseScenarioBundle(payload);
};

export const loadSeedRun = async (id: string): Promise<unknown> => {
  const payload = await fetcher(`/api/recovery-saga/run/${id}`);
  return payload;
};

export const loadSeedPolicy = async (id: string): Promise<unknown> => {
  const payload = await fetcher(`/api/recovery-saga/policy/${id}`);
  return payload;
};

type SagaRuntimeInput = {
  readonly input: unknown;
  readonly runtime: string;
};

export const runScenarioOrchestrator = async (
  config: NoInfer<SagaRuntimeConfig>,
  bundle: ScenarioBundle,
): Promise<Result<SagaRuntimeSnapshot, Error>> => {
  const runtime = createSagaRuntime(config);
  const prepared: SagaRuntimeInput = {
    input: {
      run: bundle.run,
      plan: bundle.plan,
      policy: bundle.policy,
    },
    runtime: config.runtimeId,
  };
  try {
    return await runtime.run(prepared);
  } finally {
    await runtime.close();
  }
};

export const parseScenarioBundleToRunPolicy = (bundle: SagaScenarioBundle): {
  readonly run: ReturnType<typeof parseScenarioRun>['payload'];
  readonly policy: ReturnType<typeof parseScenarioPolicy>['payload'];
} => ({
  run: parseScenarioRun(bundle.run).payload,
  policy: parseScenarioPolicy(bundle.policy).payload,
});

export { parseScenarioRun, parseScenarioPolicy, ParsedScenarioPolicy, type ParsedScenarioRun };
