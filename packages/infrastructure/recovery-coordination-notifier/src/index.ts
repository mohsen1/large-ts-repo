import type { CoordinationDeliveryEvent } from './types';
import type { Result } from '@shared/result';

export interface CoordinationDeliveryChannel {
  publish(event: CoordinationDeliveryEvent): Promise<Result<CoordinationDeliveryResult, Error>>;
}

export interface CoordinationDeliveryResult {
  readonly delivered: boolean;
  readonly messageId?: string;
  readonly reason?: string;
  readonly deliveredAt: string;
}

export * from './adapter';
export * from './types';
