import type { CadenceEventPublisher, CadencePlanBuilder, CadenceIntentProcessor, CadenceForecastEngine } from './ports';
import { RecoveryCadenceCoordinator } from './orchestrator';
import type { CadenceCoordinatorConfig, CadenceCoordinatorError } from './types';
import type { CadencePlan } from '@domain/recovery-cadence-orchestration';

export interface InMemoryAdapterOptions {
  readonly config: CadenceCoordinatorConfig;
  readonly publisher?: CadenceEventPublisher;
}

export interface CadenceServiceRuntime {
  coordinator: RecoveryCadenceCoordinator;
  execute: (plan: CadencePlan) => Promise<string>;
}

export const createInMemoryCadenceRuntime = ({
  config,
  publisher,
}: InMemoryAdapterOptions): CadenceServiceRuntime => {
  const sink = publisher ?? { publish: async () => undefined };
  const coordinator = new RecoveryCadenceCoordinator(config, sink);

  return {
    coordinator,
    async execute(plan: CadencePlan): Promise<string> {
      const persisted = await coordinator.persistPlan(plan);
      if (!persisted.ok) {
        return `error:${persisted.error.code}`;
      }
      const started = await coordinator.bootstrap(plan.id);
      return started.ok ? `plan:${plan.id}:started` : `error:${started.error.code}`;
    },
  };
};

export const isCadenceError = (error: CadenceCoordinatorError | unknown): error is CadenceCoordinatorError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['not-found', 'validation', 'persist', 'saturation', 'constraint'].includes((error as CadenceCoordinatorError).code)
  );
};

export const adaptPortals = (
  builder: CadencePlanBuilder & CadenceIntentProcessor & CadenceForecastEngine,
): CadencePlanBuilder & CadenceIntentProcessor & CadenceForecastEngine => builder;
