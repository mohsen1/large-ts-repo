import type {
  OrchestrationLabId,
  LabPlanId,
  LabRunId,
} from './model';

export interface SelectionEvent {
  readonly id: string;
  readonly labId: OrchestrationLabId;
  readonly selectedPlanId?: LabPlanId;
  readonly performedAt: string;
  readonly actor: string;
  readonly reason: 'manual' | 'auto' | 'policy';
  readonly metadata: Record<string, unknown>;
}

export interface RunEvent {
  readonly id: string;
  readonly runId: LabRunId;
  readonly labId: OrchestrationLabId;
  readonly planId: LabPlanId;
  readonly status: 'scheduled' | 'running' | 'succeeded' | 'failed' | 'paused';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly metrics: {
    readonly stepCount: number;
    readonly logCount: number;
  };
}

export interface TimelineSnapshot {
  readonly labId: OrchestrationLabId;
  readonly collectedAt: string;
  readonly selectEvents: readonly SelectionEvent[];
  readonly runEvents: readonly RunEvent[];
}

const sortByDate = <T extends { readonly performedAt: string }>(items: readonly T[]): readonly T[] =>
  [...items].sort((left, right) => right.performedAt.localeCompare(left.performedAt));

const sortByStart = <T extends { readonly startedAt: string }>(items: readonly T[]): readonly T[] =>
  [...items].sort((left, right) => right.startedAt.localeCompare(left.startedAt));

const nextSelectionId = (labId: OrchestrationLabId): string => `selection:${labId}:${Date.now()}`;

const nextRunId = (runId: LabRunId, status: RunEvent['status']): string => `run:${runId}:${status}:${Date.now()}`;

export class SelectionHistory {
  private readonly selectEvents: SelectionEvent[] = [];
  private readonly runEvents: RunEvent[] = [];

  addSelection(event: Omit<SelectionEvent, 'id' | 'performedAt'> & { performedAt?: string }): string {
    const created: SelectionEvent = {
      id: nextSelectionId(event.labId),
      labId: event.labId,
      selectedPlanId: event.selectedPlanId,
      performedAt: event.performedAt ?? new Date().toISOString(),
      actor: event.actor,
      reason: event.reason,
      metadata: event.metadata,
    };
    this.selectEvents.push(created);
    return created.id;
  }

  recordRunScheduled(
    runId: LabRunId,
    labId: OrchestrationLabId,
    planId: LabPlanId,
    stepCount: number,
  ): string {
    const created: RunEvent = {
      id: nextRunId(runId, 'scheduled'),
      runId,
      labId,
      planId,
      status: 'scheduled',
      startedAt: new Date().toISOString(),
      metrics: {
        stepCount,
        logCount: 1,
      },
    };
    this.runEvents.push(created);
    return created.id;
  }

  recordRunResult(runId: LabRunId, labId: OrchestrationLabId, planId: LabPlanId, status: RunEvent['status'], stepCount: number): string {
    const created: RunEvent = {
      id: nextRunId(runId, status),
      runId,
      labId,
      planId,
      status,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      metrics: {
        stepCount,
        logCount: Math.max(1, stepCount),
      },
    };
    this.runEvents.push(created);
    return created.id;
  }

  snapshot(labId: OrchestrationLabId): TimelineSnapshot {
    return {
      labId,
      collectedAt: new Date().toISOString(),
      selectEvents: sortByDate(this.selectEvents.filter((entry) => entry.labId === labId)),
      runEvents: sortByStart(this.runEvents.filter((entry) => entry.labId === labId)),
    };
  }

  remove(labId: OrchestrationLabId): void {
    this.selectEvents.splice(0, this.selectEvents.length, ...this.selectEvents.filter((entry) => entry.labId !== labId));
    this.runEvents.splice(0, this.runEvents.length, ...this.runEvents.filter((entry) => entry.labId !== labId));
  }

  clear(): void {
    this.selectEvents.length = 0;
    this.runEvents.length = 0;
  }

  getLatestSelection(labId: OrchestrationLabId): SelectionEvent | undefined {
    return [...this.selectEvents].reverse().find((entry) => entry.labId === labId);
  }

  getLatestRun(labId: OrchestrationLabId): RunEvent | undefined {
    return [...this.runEvents].reverse().find((entry) => entry.labId === labId);
  }

  get totals(): { readonly selections: number; readonly runs: number } {
    return { selections: this.selectEvents.length, runs: this.runEvents.length };
  }
}

export const isRunSuccess = (event: RunEvent): boolean => event.status === 'succeeded';
