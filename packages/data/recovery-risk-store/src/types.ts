import type { Brand } from '@shared/core';
import type { Envelope } from '@shared/protocol';
import type {
  RiskAssessment,
  RiskFactor,
  RiskProfileId,
  RiskRunId,
  RiskSignal,
  RiskSignalId,
  RiskWindow,
} from '@domain/recovery-risk-models';
import type { RecoveryPolicy } from '@domain/recovery-policy';

export type RiskPolicyBindingId = Brand<string, 'RiskPolicyBindingId'>;

export interface RiskSignalEnvelope {
  readonly signal: RiskSignal;
  readonly envelope: Envelope<RiskSignal>;
}

export interface RecoveryRiskProfileSnapshot {
  readonly profileId: RiskProfileId;
  readonly runId: RiskRunId;
  readonly policy?: RecoveryPolicy;
  readonly assessment: RiskAssessment;
  readonly window: RiskWindow;
  readonly factors: readonly RiskFactor[];
  readonly createdAt: string;
}

export interface RiskQuery {
  readonly runId?: RiskRunId;
  readonly policyId?: Brand<string, 'RecoveryPolicyId'>;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface RiskHistoryPage {
  readonly items: readonly RecoveryRiskProfileSnapshot[];
  readonly hasMore: boolean;
  readonly total: number;
  readonly nextCursor?: string;
}

export interface RiskPolicyBinding {
  readonly bindingId: RiskPolicyBindingId;
  readonly policy: RecoveryPolicy;
  readonly enabled: boolean;
}

export interface RiskSignalWithTrace {
  readonly id: RiskSignalId;
  readonly runId: RiskRunId;
  readonly sequence: number;
  readonly signal: RiskSignal;
}
