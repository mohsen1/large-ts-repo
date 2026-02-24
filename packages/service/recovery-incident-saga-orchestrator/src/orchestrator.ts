import { parseScenarioBundle } from '@domain/recovery-incident-saga';
import { buildTopology } from '@domain/recovery-incident-saga';
import { runWithRuntime, type SagaRuntimeSnapshot, type SagaRuntimeConfig } from './runtime';
import type { NoInfer } from '@shared/type-level';

export interface OrchestratorHandle {
  run: (payload: unknown) => Promise<boolean>;
  stop: () => Promise<void>;
  summary: () => string;
  snapshot: () => SagaRuntimeSnapshot;
}

const DEFAULT_RUNTIME_ID = 'incident-saga-default';

export class RecoveryIncidentSagaOrchestrator {
  readonly #config: SagaRuntimeConfig;
  #snapshot: SagaRuntimeSnapshot | undefined;

  constructor(config: SagaRuntimeConfig) {
    this.#config = {
      runtimeId: config.runtimeId ?? DEFAULT_RUNTIME_ID,
      namespace: config.namespace ?? 'incident-saga',
    };
  }

  async run(input: unknown): Promise<boolean> {
    const parsed = parseScenarioBundle(input);
    const topology = buildTopology(parsed.plan);
    const ordered = [...topology.order];
    const payload = {
      run: parsed.run,
      plan: parsed.plan,
      policy: parsed.policy,
      topology: ordered.map((node) => [`${node}`, `${node}-next`]) as Array<[string, string]>,
      runtime: this.#config.runtimeId,
    };
    const output = await runWithRuntime(this.#config, payload);
    if (!output.ok) {
      return false;
    }
    this.#snapshot = output.value;
    return true;
  }

  async stop(): Promise<void> {
    this.#snapshot = {
      runId: `${this.#config.runtimeId}-stopped`,
      state: 'idle',
      events: [],
    };
  }

  summary(): string {
    const snapshot = this.#snapshot;
    return JSON.stringify({
      runtimeId: this.#config.runtimeId,
      namespace: this.#config.namespace,
      state: snapshot?.state,
      eventCount: snapshot?.events.length ?? 0,
      runId: snapshot?.runId,
    });
  }

  snapshot(): SagaRuntimeSnapshot {
    return this.#snapshot ?? {
      runId: `${this.#config.runtimeId}-empty`,
      state: 'idle',
      events: [],
    };
  }
}

export const createOrchestrator = (config: NoInfer<SagaRuntimeConfig>): OrchestratorHandle => {
  const orchestrator = new RecoveryIncidentSagaOrchestrator(config);
  let lastSummary = 'idle';
  return {
    run: async (payload: unknown): Promise<boolean> => {
      const result = await orchestrator.run(payload);
      lastSummary = orchestrator.summary();
      return result;
    },
    stop: async () => {
      await orchestrator.stop();
      lastSummary = 'stopped';
    },
    summary: () => lastSummary,
    snapshot: () => orchestrator.snapshot(),
  };
};
