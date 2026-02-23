import type {
  ContinuityReadinessEnvelope,
  ContinuityReadinessTenantId,
  ContinuityReadinessRun,
} from '@domain/recovery-continuity-readiness';
import type { Result } from '@shared/result';

export interface ContinuityReadinessGateway {
  persistEnvelope(input: ContinuityReadinessEnvelope): Promise<Result<void, Error>>;
  persistRun(run: ContinuityReadinessRun): Promise<Result<void, Error>>;
  announceSelection(run: ContinuityReadinessRun): Promise<Result<void, Error>>;
}

export interface ContinuityReadinessNotifications {
  notifyCritical(input: { tenantId: ContinuityReadinessTenantId; reason: string }): Promise<Result<void, Error>>;
}

export interface ContinuityReadinessAdapters {
  readonly gateway: ContinuityReadinessGateway;
  readonly notifications: ContinuityReadinessNotifications;
}

export const inMemoryAdapters = (gateway: ContinuityReadinessGateway, notifications: ContinuityReadinessNotifications): ContinuityReadinessAdapters => ({
  gateway,
  notifications,
});
