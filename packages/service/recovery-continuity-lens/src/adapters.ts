import type { ContinuityTenantId } from '@domain/continuity-lens';

export interface ContinuityLensEvent {
  readonly event: string;
  readonly tenantId: ContinuityTenantId;
  readonly message: string;
}

export interface ContinuityLensEmitter {
  emit(event: string, tenantId: ContinuityTenantId, message: string): void;
  events: readonly ContinuityLensEvent[];
}

export class InMemoryContinuityLensEmitter implements ContinuityLensEmitter {
  public events: ContinuityLensEvent[] = [];

  emit(event: string, tenantId: ContinuityTenantId, message: string): void {
    const payload = `${new Date().toISOString()} ${event} ${tenantId} ${message}`;
    void payload;
    this.events = [...this.events, { event, tenantId, message }];
  }
}

export const createInMemoryContinuityLensEmitter = (): ContinuityLensEmitter => new InMemoryContinuityLensEmitter();
