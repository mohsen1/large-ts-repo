import { Brand, DeepReadonly, Prettify } from '@shared/type-level';

export type IdentityProvider = 'password' | 'totp' | 'sms' | 'email' | 'biometric' | 'webauthn';

export interface ChallengeSeed {
  value: Brand<string, 'challenge-seed'>;
  ttlMs: number;
}

export interface IdentityFactor<T extends IdentityProvider = IdentityProvider> {
  provider: T;
  enabled: boolean;
  lastUsed?: Date;
  createdAt: Date;
  attempts: number;
}

export interface VerificationContext {
  tenantId: Brand<string, 'tenant-id'>;
  userId: Brand<string, 'user-id'>;
  sessionId: Brand<string, 'session-id'>;
  ip: string;
  userAgent: string;
  issuedAt: Date;
}

export interface VerificationPolicy {
  provider: ReadonlySet<IdentityProvider>;
  minQuality: number;
  maxFailures: number;
  expiryMs: number;
  lockAfterMs: number;
}

export interface VerificationAttempt {
  id: Brand<string, 'attempt-id'>;
  context: VerificationContext;
  factors: IdentityFactor[];
  policy: VerificationPolicy;
  seed: ChallengeSeed;
  startedAt: Date;
  finishedAt?: Date;
  success?: boolean;
}

export interface VerificationReceipt {
  attemptId: Brand<string, 'attempt-id'>;
  context: VerificationContext;
  factorsUsed: readonly IdentityProvider[];
  score: number;
  metadata: Readonly<Record<string, unknown>>;
}

export type VerifiedAttempt = Prettify<
  DeepReadonly<{
    attemptId: Brand<string, 'attempt-id'>;
    status: 'verified';
    proof: string;
  }>
>;

