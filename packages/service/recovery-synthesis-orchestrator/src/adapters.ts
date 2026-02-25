import type { ScenarioReadModel } from '@domain/recovery-scenario-lens';
import type { OrchestratorEnvelope } from './types';

export interface RunbookStorage {
  save(model: ScenarioReadModel): Promise<void>;
  load(scenarioId: string): Promise<ScenarioReadModel | undefined>;
}

export interface EventPublisher {
  publish(eventType: string, payload: unknown): Promise<void>;
}

export interface OrchestratorLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface OrchestratorAdapterBundle {
  readonly storage: RunbookStorage;
  readonly publisher: EventPublisher;
  readonly logger: OrchestratorLogger;
}

export interface OrchestratorRuntimeSnapshot {
  readonly timestamp: string;
  readonly envelope: OrchestratorEnvelope;
  readonly currentRun?: OrchestratorEnvelope;
}
