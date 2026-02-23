import { Brand } from '@shared/type-level';
import { EntityId, PlanId, UtcIsoTimestamp } from './identifiers';
import { CommandEvent } from './runtime';

export type SignalSeverity = 'info' | 'notice' | 'warning' | 'critical';

export type ForecastSignal = {
  signalId: Brand<string, 'SignalId'>;
  planId: PlanId;
  source: string;
  title: string;
  body: string;
  score: number;
  severity: SignalSeverity;
  seenAt: UtcIsoTimestamp;
};

export type AdvisoryStatus = 'open' | 'in_progress' | 'done' | 'suppressed';

export type OperationalSignal = {
  id: EntityId;
  planId: PlanId;
  code: string;
  message: string;
  severity: SignalSeverity;
  relatedActions: ReadonlyArray<EntityId>;
  expiresAt?: UtcIsoTimestamp;
  status: AdvisoryStatus;
};

export type CockpitSignal = ForecastSignal | OperationalSignal | CommandEvent;

export type SignalDigest = {
  timestamp: UtcIsoTimestamp;
  activeCount: number;
  criticalCount: number;
  mutedCount: number;
  signals: ReadonlyArray<CockpitSignal>;
};

export const classifySignal = (value: number): SignalSeverity => {
  if (value >= 90) return 'critical';
  if (value >= 70) return 'warning';
  if (value >= 50) return 'notice';
  return 'info';
};
