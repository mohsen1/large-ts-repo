import { fail, ok, type Result } from '@shared/result';

import { type MeshExecutionContext, type MeshPhase, type MeshRuntimeEvent } from '@domain/recovery-fusion-intelligence';

export interface MeshExecutionScope {
  readonly runId: string;
  readonly startedAt: string;
  readonly phase: MeshPhase;
}

interface AsyncDisposableLike {
  [Symbol.asyncDispose](): Promise<void>;
}

interface MeshScopeState {
  readonly runId: string;
  phase: MeshPhase;
  events: MeshRuntimeEvent[];
}

export class MeshRunScope implements AsyncDisposableLike {
  #disposed = false;
  readonly #events: MeshRuntimeEvent[];

  constructor(private readonly state: MeshScopeState, private readonly context: MeshExecutionContext | null = null) {
    this.#events = state.events;
  }

  [Symbol.asyncDispose] = async (): Promise<void> => {
    this.#disposed = true;
    this.state.phase = 'finish';
    if (this.context) {
      this.state.events.push({
        runId: this.state.runId as MeshExecutionContext['runId'],
        phase: this.state.phase,
        marker: `phase:${this.state.phase}`,
        payload: {
          contextPhase: this.context.phase,
          pluginCount: this.context.policy.pluginIds.length,
          signalCount: this.context.topology.nodes.length,
        },
      });
    }
  };

  get disposed(): boolean {
    return this.#disposed;
  }
}

export const createMeshRunScope = (
  runId: string,
  context: MeshExecutionContext,
): Result<MeshRunScope, Error> => {
  if (!runId) {
    return fail(new Error('runId required'));
  }

  return ok(
    new MeshRunScope(
      {
        runId,
        events: [],
        phase: 'ingest',
      },
      context,
    ),
  );
};

export const appendEvent = (event: MeshRuntimeEvent, events: MeshRuntimeEvent[]): void => {
  events.push(event);
};
