import { CommandEvent, RecoveryAction, RecoveryPlan, RuntimeRun, PlanId } from '@domain/recovery-cockpit-models';
import { CockpitStore, InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type OrchestrationClock = {
  now(): Date;
};

export interface ExternalAdapter {
  dispatch(action: RecoveryAction): Promise<{ commandId: string }>;
  stop(commandId: string): Promise<boolean>;
}

export interface CockpitWorkspace {
  store: CockpitStore;
  clock: OrchestrationClock;
  adapter: ExternalAdapter;
}

export type OrchestrationResult = {
  run: RuntimeRun;
  events: CommandEvent[];
};

export type OrchestratorConfig = {
  parallelism: number;
  maxRuntimeMinutes: number;
  retryPolicy: {
    enabled: boolean;
    maxRetries: number;
  };
};

export const defaultClock: OrchestrationClock = {
  now: () => new Date(),
};

export const createInMemoryWorkspace = (store?: CockpitStore): CockpitWorkspace => ({
  store: store ?? new InMemoryCockpitStore(),
  clock: defaultClock,
  adapter: {
    dispatch: async (action) => ({
      commandId: `${action.id}:${Date.now()}`,
    }),
    stop: async () => true,
  },
});
