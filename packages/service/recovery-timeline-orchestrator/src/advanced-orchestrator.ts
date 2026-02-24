import { InMemoryTimelineRepository } from '@data/recovery-timeline-store';
import type { RecoveryTelemetrySnapshot, RecoveryTimeline } from '@domain/recovery-timeline';
import { forecastRecoveryCompletion, createPlanFromTimeline } from '@domain/recovery-timeline';
import { Result } from '@shared/result';
import { createPluginSession } from '@shared/type-level';
import { DEFAULT_ORCHESTRATION_POLICY, OrchestrationInput, OrchestrationPolicy, OrchestrationResult } from './types';
import { TIMELINE_POLICY_MANIFEST } from './bootstrap';
import {
  TimelineCommandPlugin,
  TimelineAction,
  TimelinePluginPayload,
  TimelinePolicyResult,
  TimelinePluginOutput,
  toExecutionContext,
} from './policy-catalog';

type AsyncStackLike = {
  use<T>(resource: T): T;
  disposeAsync(): Promise<void>;
};

type StackCtor = new () => AsyncStackLike;

const AsyncStackCtor = (globalThis as { AsyncDisposableStack?: StackCtor }).AsyncDisposableStack;

interface PolicyExecutionStep {
  readonly name: string;
  readonly status: TimelinePolicyResult<TimelinePluginOutput>['status'];
  readonly durationMs: number;
}

function createTelemetrySnapshot(
  timeline: RecoveryTimeline,
  actor: string,
  policy: OrchestrationPolicy,
): RecoveryTelemetrySnapshot {
  const completed = timeline.events.filter((event) => event.state === 'completed').length;
  const ratio = timeline.events.length === 0 ? 0 : (completed / timeline.events.length) * 100;
  const ordered = [...timeline.events].sort((left, right) => left.start.getTime() - right.start.getTime());
  return {
    timelineId: timeline.id,
    source: actor,
    measuredAt: new Date(),
    confidence: Math.max(40, Math.min(98, ratio + policy.minRecoveryEvents * 2)),
    expectedReadyAt: ordered.at(-1)?.end ?? new Date(),
    actualReadyAt: ratio === 100 ? new Date() : undefined,
    note: `plan-${ordered[0]?.id ?? 'none'} confidence ${Math.round(ratio)}%`,
  };
}

async function withAsyncStack<T>(work: (stack: AsyncStackLike | null) => Promise<T>): Promise<T> {
  if (!AsyncStackCtor) {
    return work(null);
  }
  const stack = new AsyncStackCtor();
  try {
    return await work(stack);
  } finally {
    await stack.disposeAsync();
  }
}

class PolicyScope implements AsyncDisposable {
  #steps: PolicyExecutionStep[] = [];

  constructor(
    private readonly plugins: readonly TimelineCommandPlugin<string, { timelineId: string }, TimelinePluginOutput>[],
    private readonly action: TimelineAction,
    private readonly actor: string,
  ) {}

  get steps(): readonly PolicyExecutionStep[] {
    return [...this.#steps];
  }

  async runPlugin(plugin: TimelineCommandPlugin<any, TimelinePluginPayload, TimelinePluginOutput>): Promise<boolean> {
    const startedAt = Date.now();
    const context = toExecutionContext(this.actor, this.action, DEFAULT_ORCHESTRATION_POLICY);
    const payload = { timelineId: context.trace.correlationId };
    const input = {
      kind: this.action,
      phase: this.action,
      createdAt: new Date(),
      payload,
      tags: plugin.supports,
      id: plugin.id,
      name: plugin.name,
      action: this.action,
      namespace: context.state.actor,
    };

    if (!plugin.canProcess(input, context.trace)) {
      this.#steps.push({ name: plugin.name, status: 'skip', durationMs: 0 });
      return true;
    }

    const output = await plugin.execute(input, context);
    this.#steps.push({ name: plugin.name, status: output.status, durationMs: Date.now() - startedAt });
    return output.status !== 'error';
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#steps = [];
    return Promise.resolve();
  }
}

export class TimelinePolicyOrchestrator {
  readonly #policy: OrchestrationPolicy;

  constructor(policy: OrchestrationPolicy = DEFAULT_ORCHESTRATION_POLICY) {
    this.#policy = policy;
  }

  async run(
    input: OrchestrationInput,
    repository: InMemoryTimelineRepository,
  ): Promise<Result<OrchestrationResult>> {
    const loaded = repository.load(input.timeline.id);
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }

    const timeline = loaded.value;
    const base = createTelemetrySnapshot(timeline, input.actor, this.#policy);
    const plan = createPlanFromTimeline(timeline);
    const forecast = forecastRecoveryCompletion(timeline);
    const pluginSession = createPluginSession(
      TIMELINE_POLICY_MANIFEST.entries as TimelineCommandPlugin<
        string,
        { timelineId: string },
        TimelinePluginOutput
      >[],
      {
        name: 'timeline-policy-session',
        capacity: TIMELINE_POLICY_MANIFEST.entries.length,
      },
    );
    using _session = pluginSession;

    const plugins = this.resolvePlugins(TIMELINE_POLICY_MANIFEST.entries, input.requestedAction);
    const pluginSummary = pluginSession.registry.getAll().map((plugin) => plugin.name).join(',');

    let updatedTimeline = timeline;
    await withAsyncStack(async (stack) => {
      await using scope = new PolicyScope(plugins, input.requestedAction, input.actor);
      stack?.use(scope);
      for (const plugin of plugins) {
        const ok = await scope.runPlugin(plugin as TimelineCommandPlugin<any, TimelinePluginPayload, TimelinePluginOutput>);
        if (!ok) {
          return;
        }
      }
      const progress = Math.round((forecast.confidenceBand[1] + forecast.confidenceBand[0]) / 2);
      updatedTimeline = {
        ...timeline,
        name: `${timeline.name} [${pluginSummary}]`,
        events: timeline.events.map((event) => {
          if (event.state === 'queued' && this.#policy.allowReopenAfterCompleted) {
            return { ...event, state: 'running' };
          }
          if (event.state === 'running' && progress > 50) {
            return { ...event, state: 'completed' };
          }
          return event;
        }),
        updatedAt: new Date(),
      };
    });

    const forecastWarning = `plan=${plan.id}; steps=${plan.steps.length}; riskWindow=${plan.riskWindow.join('..')}`;
    if (input.requestedAction === 'simulate' || input.dryRun) {
      return {
        ok: true,
        value: {
          timeline: updatedTimeline,
          snapshot: base,
          forecast: forecast,
          warning: input.requestedAction === 'simulate' ? forecastWarning : undefined,
        },
      };
    }

    if (input.requestedAction === 'advance') {
      const applied = updatedTimeline.events.map((event) => ({
        ...event,
        state: event.state === 'queued' ? 'running' : event.state,
      }));
      updatedTimeline = { ...updatedTimeline, events: applied, updatedAt: new Date() };
      repository.save(updatedTimeline, base);
    }

    return {
      ok: true,
      value: {
        timeline: updatedTimeline,
        snapshot: {
          ...base,
          note: `${base.note}; steps=${plan.steps.length}; policy=${JSON.stringify(this.#policy)}`,
        },
        warning: forecastWarning,
      },
    };
  }

  private resolvePlugins(
    plugins: readonly TimelineCommandPlugin<any, TimelinePluginPayload, TimelinePluginOutput>[],
    action: TimelineAction,
  ): readonly TimelineCommandPlugin<any, TimelinePluginPayload, TimelinePluginOutput>[] {
    const candidate = plugins
      .filter((plugin) => plugin.supports.includes(action))
      .sort((left, right) => left.version.localeCompare(right.version))
      .map((plugin) => plugin as TimelineCommandPlugin<any, TimelinePluginPayload, TimelinePluginOutput>);
    return candidate.length > 0 ? candidate : [];
  }
}

export function createPolicyOrchestrator(policy: OrchestrationPolicy = DEFAULT_ORCHESTRATION_POLICY): TimelinePolicyOrchestrator {
  return new TimelinePolicyOrchestrator(policy);
}

export async function runPolicyAwareSimulation(
  timeline: RecoveryTimeline,
  repository: InMemoryTimelineRepository,
): Promise<Result<RecoveryTelemetrySnapshot>> {
  const orchestrator = createPolicyOrchestrator();
  const result = await orchestrator.run(
    {
      timeline,
      actor: 'policy-lab',
      requestedAction: 'simulate',
      dryRun: true,
    },
    repository,
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: result.value.snapshot ?? createTelemetrySnapshot(timeline, 'policy-lab', DEFAULT_ORCHESTRATION_POLICY) };
}
