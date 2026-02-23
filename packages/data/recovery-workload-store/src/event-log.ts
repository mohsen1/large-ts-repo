import type { WorkloadUnitId } from '@domain/recovery-workload-intelligence';

export interface WorkloadEvent {
  readonly at: string;
  readonly nodeId: WorkloadUnitId;
  readonly kind: 'plan-created' | 'plan-failed' | 'plan-executed' | 'drill-complete';
  readonly message: string;
  readonly metadata: Record<string, string>;
}

export interface WorkloadEventBus {
  readonly emit: (event: WorkloadEvent) => void;
  readonly list: () => readonly WorkloadEvent[];
}

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  return JSON.stringify(value);
};

class InMemoryWorkloadEventBus implements WorkloadEventBus {
  private readonly events: WorkloadEvent[] = [];

  emit(event: WorkloadEvent): void {
    this.events.push(event);
  }

  list(): readonly WorkloadEvent[] {
    return this.events.slice().reverse();
  }
}

export const createWorkloadEventBus = (): WorkloadEventBus => new InMemoryWorkloadEventBus();

export const buildEvent = (
  nodeId: WorkloadUnitId,
  kind: WorkloadEvent['kind'],
  message: string,
  metadata: Record<string, unknown> = {},
): WorkloadEvent => ({
  at: new Date().toISOString(),
  nodeId,
  kind,
  message,
  metadata: Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, toStringValue(value)])),
});
