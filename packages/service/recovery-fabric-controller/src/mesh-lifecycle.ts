import { fail, ok, type Result } from '@shared/result';

import {
  type MeshExecutionContext,
  type MeshManifestEntry,
  type MeshPhase,
  type MeshRunId,
  type MeshRuntimeEvent,
  asMeshRuntimeMarker,
} from '@domain/recovery-fusion-intelligence';

export interface MeshExecutionScope {
  readonly runId: MeshRunId;
  readonly startedAt: string;
  readonly phase: MeshPhase;
  readonly events: readonly MeshRuntimeEvent[];
  readonly manifests: readonly MeshManifestEntry[];
}

interface AsyncDisposableLike {
  [Symbol.asyncDispose](): Promise<void>;
}

class ScopeState {
  readonly startedAt: string;
  readonly events: MeshRuntimeEvent[];
  phase: MeshPhase;

  constructor(readonly runId: MeshRunId, readonly manifests: readonly MeshManifestEntry[], initialPhase: MeshPhase) {
    this.phase = initialPhase;
    this.startedAt = new Date().toISOString();
    this.events = [];
  }

  push(event: Omit<MeshRuntimeEvent, 'runId'>): void {
    this.events.push({ ...event, runId: this.runId });
  }
}

export class MeshRunScope implements AsyncDisposableLike {
  #state: ScopeState;
  #disposed = false;

  constructor(
    state: ScopeState,
    private readonly context: MeshExecutionContext,
  ) {
    this.#state = state;
  }

  get events(): readonly MeshRuntimeEvent[] {
    return [...this.#state.events];
  }

  get phase(): MeshPhase {
    return this.#state.phase;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  [Symbol.asyncDispose] = async (): Promise<void> => {
    if (this.#disposed) return;

    this.#disposed = true;
    this.#state.push({
      phase: 'finish',
      marker: asMeshRuntimeMarker('finish'),
      payload: {
        contextRunId: this.context.runId,
        pluginCount: this.context.policy.pluginIds.length,
      },
    });

    this.#state.phase = 'finish';
  };

  [Symbol.dispose] = (): void => {
    void this[Symbol.asyncDispose]();
  };

  log(event: Omit<MeshRuntimeEvent, 'runId'>): void {
    this.#state.push(event);
  }
}

export const createMeshRunScope = (
  runId: MeshRunId,
  context: MeshExecutionContext,
  manifests: readonly MeshManifestEntry[] = [],
): Result<MeshRunScope, Error> => {
  if (!runId || !context?.runId) {
    return fail(new Error('runId required'));
  }

  const state = new ScopeState(runId, manifests, context.phase);
  return ok(new MeshRunScope(state, context));
};

export const appendEvent = (event: MeshRuntimeEvent, events: readonly MeshRuntimeEvent[]): readonly MeshRuntimeEvent[] => [
  ...events,
  event,
];
