import {
  AnyStreamingCommandPlugin,
  asCommandEnvelopeId,
  asCommandPluginId,
  asCommandTag,
  asCommandTraceId,
  CommandExecutionContext,
  CommandNamespace,
  CommandPlan,
  CommandSignalEnvelope,
} from '@domain/streaming-command-intelligence';
import { StreamingCommandPluginRegistry } from '@domain/streaming-command-intelligence';

type AsyncStackLike = {
  adopt<T>(resource: T, onDispose: (value: T) => PromiseLike<void> | void): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type AsyncStackCtor = { new (): AsyncStackLike };

const resolveAsyncStack = (): AsyncStackCtor => {
  const Candidate = (globalThis as { AsyncDisposableStack?: AsyncStackCtor }).AsyncDisposableStack;
  if (Candidate) return Candidate;
  return class FallbackAsyncDisposableStack implements AsyncStackLike {
    private readonly disposers: Array<() => Promise<void> | void> = [];
    adopt<T>(resource: T, onDispose: (value: T) => Promise<void> | void): T {
      this.disposers.push(() => onDispose(resource));
      return resource;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
        await this.disposers[index]?.();
      }
    }
  };
};

const AsyncStack = resolveAsyncStack();

const fallbackPlugin = <TInput, TOutput>(step: CommandPlan['plugins'][number]) => ({
  ...step,
  async run(input: TInput, context: CommandExecutionContext): Promise<TOutput> {
    return {
      ...(typeof input === 'object' && input !== null ? input : {}),
      fallback: true,
      step: step.name,
      plugin: context.pluginName,
      namespace: step.namespace,
      latencyBudgetMs: step.latencyBudgetMs,
    } as unknown as TOutput;
  },
});

const asNamespace = (value: CommandPlan['plugins'][number]['namespace']): CommandNamespace => value;

export interface PipelineTrace {
  readonly name: string;
  readonly elapsedMs: number;
  readonly namespace: CommandNamespace;
}

export class CommandIntelligencePipeline {
  private readonly namespaceGroups: Readonly<Record<CommandNamespace, readonly string[]>>;

  public constructor(
    private readonly registry: StreamingCommandPluginRegistry<readonly AnyStreamingCommandPlugin[]> = new StreamingCommandPluginRegistry(
      [] as unknown as readonly AnyStreamingCommandPlugin[],
    ),
  ) {
    const snapshot = this.registry.namespaceSnapshot?.();
    this.namespaceGroups = (snapshot as unknown as Readonly<Record<CommandNamespace, readonly string[]>>) ?? {};
  }

  public async execute<TSeed>(
    plan: CommandPlan,
    seed: TSeed,
    options: { readonly seed?: 'default' | 'custom'; readonly namespaceOrder?: readonly CommandNamespace[] } = {},
  ): Promise<readonly CommandSignalEnvelope[]> {
    await using stack = new AsyncStack();

    const traceId = asCommandTraceId(`trace:${plan.planId}:${Date.now()}`);
    const now = new Date().toISOString();
    const orderedNamespaces = options.namespaceOrder?.length
      ? [...options.namespaceOrder]
      : [...new Set(plan.plugins.map((plugin) => plugin.namespace))];

    const contextSeed: CommandExecutionContext = {
      tenantId: plan.tenantId,
      streamId: plan.streamId,
      traceId,
      runId: plan.planId,
      pluginName: plan.name,
      attempt: 0,
      startedAt: now,
    };

    const envelopes: CommandSignalEnvelope[] = [];
    let cursor: unknown = seed;

    const allPlugins = [...plan.plugins].sort((left, right) => {
      const leftIndex = orderedNamespaces.indexOf(left.namespace);
      const rightIndex = orderedNamespaces.indexOf(right.namespace);
      if (leftIndex === rightIndex) {
        return left.stepId.localeCompare(right.stepId);
      }
      return leftIndex - rightIndex;
    });

    for (const step of allPlugins) {
      const namespace = asNamespace(step.namespace);
      const plugin = (this.registry.resolvePlugin(step) ?? fallbackPlugin(step)) as AnyStreamingCommandPlugin;
      const stepContext = {
        ...contextSeed,
        pluginName: step.name,
        attempt: contextSeed.attempt + 1,
      };

      const startedAt = Date.now();
      try {
        const pluginOutput = await plugin.run(cursor, {
          ...stepContext,
          attempt: stepContext.attempt,
          streamId: plan.streamId,
        } as CommandExecutionContext);

        const envelope: CommandSignalEnvelope = {
          tenantId: plan.tenantId,
          streamId: plan.streamId,
          namespace,
          envelopeId: asCommandEnvelopeId(`envelope:${plan.planId}:${step.stepId}`),
          traceId,
          pluginKind: `${namespace}-plugin`,
          tags: [
            asCommandTag(`namespace:${namespace}`),
            asCommandTag(`step:${step.name}`),
            asCommandTag('pipeline'),
          ],
          seenAt: new Date(startedAt).toISOString(),
          payload: {
            plugin: step.name,
            namespace,
            output: pluginOutput,
          },
          context: {
            pluginId: step.pluginId,
            pluginName: step.name,
            latencyMs: Date.now() - startedAt,
            status: 'succeeded',
            runId: plan.planId,
            message: `pipeline:${step.stepId}`,
          },
          signals: [],
          metadata: {
            plan: plan.name,
            streamId: plan.streamId,
            namespace,
            pluginStep: step.stepId,
          },
        };

        envelopes.push(envelope);
        cursor = pluginOutput;
        stack.adopt(
          {
            plugin,
            namespace,
            [Symbol.asyncDispose]() {
              return Promise.resolve();
            },
          } as AsyncDisposable,
          (resource) => resource[Symbol.asyncDispose](),
        );
      } catch (error) {
        envelopes.push({
          tenantId: plan.tenantId,
          streamId: plan.streamId,
          namespace,
          envelopeId: asCommandEnvelopeId(`envelope:${plan.planId}:${step.stepId}:failed`),
          traceId,
          pluginKind: `${namespace}-plugin`,
          tags: [asCommandTag('failed')],
          seenAt: new Date().toISOString(),
          payload: {
            reason: error instanceof Error ? error.message : String(error),
          },
          context: {
            pluginId: step.pluginId,
            pluginName: step.name,
            latencyMs: Date.now() - startedAt,
            status: 'failed',
            runId: plan.planId,
            message: 'pipeline-step-failed',
          },
          signals: [],
          metadata: {
            plan: plan.name,
            namespace,
            pluginStep: step.stepId,
          },
        });
        break;
      }
    }

    const trace = envelopes.map((envelope, index) => ({
      name: envelope.context?.pluginName ?? `plugin:${index}`,
      elapsedMs: envelope.context?.latencyMs ?? 0,
      namespace: envelope.namespace,
    }));

    if (trace.length > 0) {
      envelopes.push({
        tenantId: plan.tenantId,
        streamId: plan.streamId,
        namespace: trace[0]?.namespace ?? 'ingest',
        envelopeId: asCommandEnvelopeId(`summary:${plan.planId}`),
        traceId,
        pluginKind: 'analyze-plugin',
        tags: [asCommandTag('pipeline.summary')],
        seenAt: new Date().toISOString(),
        payload: {
          eventCount: envelopes.length,
          trace,
          pluginRuns: trace.length,
        },
        context: {
          pluginId: asCommandPluginId(`summary:${plan.planId}`),
          pluginName: 'pipeline-summary',
          status: 'succeeded',
          runId: plan.planId,
          latencyMs: 0,
        },
        signals: [],
        metadata: {
          plan: plan.name,
          namespace: trace[0]?.namespace ?? 'ingest',
        },
      });
    }

    void this.namespaceGroups;
    return envelopes;
  }
}
