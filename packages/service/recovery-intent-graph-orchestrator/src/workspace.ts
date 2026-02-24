import {
  buildGraphFromPolicy,
  createNodeId,
  type IntentExecutionContext,
  type IntentInput,
  type IntentNodePayload,
  type IntentPolicy,
  type IntentRunId,
  type IntentStage,
  type PluginContract,
} from '@domain/recovery-intent-graph';
import { createDefaultEngine } from './engine';
import type { EngineOutput } from './types';

interface WorkspaceEvent {
  readonly runId: IntentRunId;
  readonly message: string;
}

export interface WorkspaceOptions {
  readonly policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>;
  readonly input: IntentInput;
}

const bootstrapIntentGraphEngine = (async () => {
  return createDefaultEngine({
    tenant: 'bootstrap',
    namespace: 'recovery-intent-graph',
    requestId: 'bootstrap',
  });
})();

export class IntentWorkspace {
  readonly #events: WorkspaceEvent[] = [];

  constructor(private readonly options: WorkspaceOptions) {}

  async run(nodes: readonly IntentNodePayload[]): Promise<readonly IntentExecutionContext<IntentNodePayload>[]> {
    const bootstrap = await bootstrapIntentGraphEngine;
    using _scope = new WorkspaceScope(this.options.input.runId);
    const graph = buildGraphFromPolicy(this.options.policy);
    const contexts: IntentExecutionContext<IntentNodePayload>[] = [];
    const sorted = nodes.toSorted((left, right) => left.weight - right.weight);

    for (const nodePayload of sorted) {
      const stage = nodePayload.kind;
      const nodeId = createNodeId(this.options.input.graphId, `workspace-${stage}`);
      const context: IntentExecutionContext<IntentNodePayload> = {
        input: this.options.input,
        node: {
          graphId: this.options.input.graphId,
          nodeId,
          kind: stage,
          stageLabel: `${stage.toUpperCase()}_STAGE` as IntentExecutionContext<IntentNodePayload>['node']['stageLabel'],
          payload: nodePayload,
          timeoutMs: 1_000,
          retries: 1,
          metadata: {
            owner: this.options.input.requestedBy,
            createdAt: new Date(),
            labels: [stage],
            labelsByStage: {
              capture: [stage],
              normalize: [stage],
              score: [stage],
              recommend: [stage],
              simulate: [stage],
              resolve: [stage],
            },
          },
        },
        payload: nodePayload,
        abort: new AbortController().signal,
      };

      const output = await bootstrap.execute({
        policy: this.options.policy,
        nodes: graph.nodes().map((mappedNodeId, index) => ({
          kind: mappedNodeId.includes('capture') ? 'capture' : this.options.policy.steps[index] ?? 'resolve',
          weight: 1 + index,
        })),
      });

      if (!output.outcome.ok) {
        this.#events.push({ runId: this.options.input.runId, message: `failed:${stage}` });
      }

      contexts.push(context);
    }

    return contexts;
  }

  async replay(): Promise<readonly EngineOutput[]> {
    const bootstrap = await bootstrapIntentGraphEngine;
    return [
      await bootstrap.execute({
        policy: this.options.policy,
        nodes: this.options.policy.steps.map((stage, index) => ({ kind: stage, weight: index + 1 })),
      }),
    ];
  }

  get events(): readonly WorkspaceEvent[] {
    return this.#events;
  }
}

class WorkspaceScope {
  constructor(private readonly runId: IntentRunId) {}

  [Symbol.dispose](): void {
    void this.runId;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

export const createWorkspace = (options: WorkspaceOptions): IntentWorkspace => new IntentWorkspace(options);
