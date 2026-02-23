import { ContinuityRunPayload, ContinuityRunResult, UtcTimestamp } from './types';

export interface TelemetryRecord {
  readonly source: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly observedAt: UtcTimestamp;
}

export interface PersistenceAdapter {
  saveResult(result: ContinuityRunResult): Promise<void>;
  loadRunPayload(scenarioId: string): Promise<ContinuityRunPayload | null>;
}

export interface TelemetryAdapter {
  emit(event: TelemetryRecord): void;
  flush(): void;
}

export interface ConstraintAdapter {
  applyConstraintSet(constraintSetId: string): Promise<boolean>;
}

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly store = new Map<string, ContinuityRunPayload>();

  async saveResult(result: ContinuityRunResult): Promise<void> {
    this.store.set(result.scenarioId, {
      planId: result.planId,
      inputState: result,
      producedAt: new Date().toISOString(),
    });
  }

  async loadRunPayload(scenarioId: string): Promise<ContinuityRunPayload | null> {
    return this.store.get(scenarioId) ?? null;
  }
}

export class BufferedTelemetryAdapter implements TelemetryAdapter {
  private readonly buffer: TelemetryRecord[] = [];

  emit(event: TelemetryRecord): void {
    this.buffer.push(event);
  }

  flush(): void {
    for (const event of this.buffer) {
      if (typeof console !== 'undefined') {
        console.log(JSON.stringify(event));
      }
    }
    this.buffer.length = 0;
  }
}

export class InMemoryConstraintAdapter {
  private readonly evaluations = new Map<string, ContinuityRunResult>();

  async upsert(result: ContinuityRunResult): Promise<void> {
    this.evaluations.set(result.planId, result);
  }

  async snapshot(planIds: ReadonlyArray<string>): Promise<Array<{ planId: string; outcomes: ContinuityRunResult }>> {
    const items: Array<{ planId: string; outcomes: ContinuityRunResult }> = [];
    for (const planId of planIds) {
      const outcomes = this.evaluations.get(planId);
      if (outcomes) {
        items.push({
          planId,
          outcomes,
        });
      }
    }
    return items;
  }

  async applyConstraintSet(constraintSetId: string): Promise<boolean> {
    return constraintSetId.length > 0;
  }
}

export const resolveAdapters = () => ({
  persistence: new InMemoryPersistenceAdapter(),
  telemetry: new BufferedTelemetryAdapter(),
  evaluator: new InMemoryConstraintAdapter(),
});
