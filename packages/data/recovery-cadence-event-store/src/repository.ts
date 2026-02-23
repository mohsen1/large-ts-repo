import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type {
  CadenceWindow,
  CadenceIntent,
  CadencePlan,
  CadenceConstraint,
  CadenceExecutionEvent,
  CadencePlanSnapshot,
} from '@domain/recovery-cadence-orchestration';
import type { CadenceEventFilters, CadenceQuery, CadenceStoreRecord, CadenceStorePage } from './types';

export interface CadenceRepository {
  listPlans(query?: CadenceQuery): Promise<Result<CadenceStorePage<CadencePlan>, Error>>;
  getPlan(planId: CadencePlan['id']): Promise<Result<CadenceStoreRecord | undefined, Error>>;
  savePlan(plan: CadencePlan): Promise<Result<CadencePlan, Error>>;
  saveWindow(window: CadenceWindow): Promise<Result<CadenceWindow, Error>>;
  saveIntent(intent: CadenceIntent): Promise<Result<CadenceIntent, Error>>;
  saveConstraint(constraint: CadenceConstraint): Promise<Result<CadenceConstraint, Error>>;
  appendEvent(event: CadenceExecutionEvent): Promise<Result<CadenceExecutionEvent, Error>>;
  appendSnapshot(snapshot: CadencePlanSnapshot): Promise<Result<CadencePlanSnapshot, Error>>;
  getEvents(filters?: CadenceEventFilters): Promise<Result<CadenceExecutionEvent[], Error>>;
  clear(): Promise<Result<void, Error>>;
}

export const notFound = <T>(id: string): Result<T, Error> => fail(new Error(`entity-not-found:${id}`));
