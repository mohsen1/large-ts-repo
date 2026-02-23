import { CommandEvent, RecoveryAction, RuntimeRun } from '@domain/recovery-cockpit-models';
import { CockpitStore } from '@data/recovery-cockpit-store';

export type OrchestrationClock = {
  now(): Date;
};

export interface ExternalAdapter {
  dispatch(action: RecoveryAction): Promise<{ commandId: string }>;
  stop(commandId: string): Promise<boolean>;
  dryRun?(action: RecoveryAction): Promise<{ commandId: string; etaMinutes: number }>;
}

export interface CockpitWorkspace {
  store: CockpitStore;
  clock: OrchestrationClock;
  adapter: ExternalAdapter;
}

export type OrchestrationResult = {
  run: RuntimeRun;
  events: readonly CommandEvent[];
};

export type OrchestratorConfig = {
  parallelism: number;
  maxRuntimeMinutes: number;
  retryPolicy: {
    enabled: boolean;
    maxRetries: number;
  };
  policyMode: 'readonly' | 'advisory' | 'enforce';
};

export const defaultClock: OrchestrationClock = {
  now: () => new Date(),
};

export const createInMemoryWorkspace = (store: CockpitStore): CockpitWorkspace => ({
  store,
  clock: defaultClock,
  adapter: {
    dispatch: async (action) => ({
      commandId: `${action.id}:${Date.now()}`,
    }),
    stop: async () => true,
  },
});
