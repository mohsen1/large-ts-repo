import { Brand } from '@shared/type-level';

export type ControlPlaneStoreRecordId = Brand<string, 'ControlPlaneStoreRecordId'>;
export type ControlPlaneSequence = Brand<number, 'ControlPlaneSequence'>;

export interface ControlPlaneRecordState {
  readonly runId: string;
  readonly envelopeId: string;
  readonly tenant: string;
  readonly planId: string;
  readonly state: 'queued' | 'armed' | 'executing' | 'aborted' | 'completed' | 'errored';
  readonly updatedAt: string;
}

export interface ControlPlanePlanSummary {
  readonly planId: string;
  readonly tenant: string;
  readonly commandCount: number;
  readonly hasConflicts: boolean;
  readonly riskBand: 'low' | 'medium' | 'high';
}

export interface ControlPlaneStoreRecord {
  readonly id: ControlPlaneStoreRecordId;
  readonly state: ControlPlaneRecordState;
  readonly summary: ControlPlanePlanSummary;
  readonly diagnostics: readonly {
    key: string;
    value: number;
    observedAt: string;
  }[];
}

export interface ControlPlaneStoreQuery {
  readonly tenant: string;
  readonly planId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly states?: readonly ControlPlaneRecordState['state'][];
}

export interface ControlPlaneStoreResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: string;
  readonly sequence?: ControlPlaneSequence;
}
