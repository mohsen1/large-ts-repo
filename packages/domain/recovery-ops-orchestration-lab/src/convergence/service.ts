import {
  type ConvergencePlan,
  type ConvergencePlanId,
  type ConvergenceRunEvent,
  type ConvergenceRunId,
  type ConvergenceRunResult,
  type ConvergenceWorkspace,
} from './types';
import {
  createConvergenceRuntime,
  type ConvergenceEngineSummary,
  type ConvergenceRuntime,
  type ConvergenceRuntimeConfig,
} from './runtime';

const normalizeRunId = (value: string): ConvergenceRunId => value as ConvergenceRunId;

const collectEvents = async function* (
  runtime: ConvergenceRuntime,
  workspace: ConvergenceWorkspace,
  plans: readonly ConvergencePlan[],
): AsyncGenerator<ConvergenceRunEvent> {
  const startAt = new Date().toISOString();
  yield {
    type: 'phase',
    at: startAt,
    runId: `${workspace.id}:stream:${Date.now()}` as ConvergenceRunId,
    phase: 'discover',
    payload: { stage: 'bootstrap', startedAt: startAt },
  };

  for await (const event of runtime.run(workspace, plans)) {
    yield event;
  }

  yield {
    type: 'phase',
    at: new Date().toISOString(),
    runId: `${workspace.id}:stream:${Date.now()}` as ConvergenceRunId,
    phase: 'close',
    payload: { stage: 'complete' },
  };
}

export interface ConvergenceWorkspaceService {
  evaluate(workspace: ConvergenceWorkspace): Promise<ConvergenceEngineSummary>;
  run(workspace: ConvergenceWorkspace): AsyncIterable<ConvergenceRunEvent>;
  summarize(workspace: ConvergenceWorkspace, plans: readonly ConvergencePlan[]): Promise<ConvergenceRunResult>;
}

const buildResultFromEvents = (runId: ConvergenceRunId, workspace: ConvergenceWorkspace, events: readonly ConvergenceRunEvent[]): ConvergenceRunResult => {
  const start = events.at(0)?.at;
  const end = events.at(-1)?.at;
  const duration =
    start && end
      ? Date.parse(end) - Date.parse(start)
      : 0;

  const payloadSelected = events
    .map((entry) => entry.payload)
    .find((entry) => entry && typeof entry === 'object' && 'selectedPlan' in (entry as object)) as
    | { selectedPlan?: ConvergencePlan }
    | undefined;

  return {
    runId,
    workspaceId: workspace.id,
    durationMs: duration,
    status: events.some((event) => event.type === 'error') ? 'failed' : 'succeeded',
    metrics: {
      latencyP50: 100,
      latencyP95: 250,
      successRate: 0.96,
      recoveryReadiness: 84,
      riskScore: 12,
    },
    selectedPlan: payloadSelected?.selectedPlan,
    events,
  };
};

export class ConvergenceWorkspaceService {
  readonly #runtime: ConvergenceRuntime;

  constructor(config?: Partial<ConvergenceRuntimeConfig>) {
    this.#runtime = createConvergenceRuntime(config);
  }

  async evaluate(workspace: ConvergenceWorkspace): Promise<ConvergenceEngineSummary> {
    return this.#runtime.evaluate(workspace, workspace.plans);
  }

  async *run(workspace: ConvergenceWorkspace): AsyncIterable<ConvergenceRunEvent> {
    const plans = workspace.plans.length > 0
      ? workspace.plans
      : [
          {
            id: `${workspace.id}-fallback` as ConvergencePlanId,
            workspaceId: workspace.id,
            title: 'fallback plan',
            score: 0,
            steps: [],
            constraints: new Map(),
            createdAt: new Date().toISOString(),
            metadata: {},
          },
        ];
    yield* collectEvents(this.#runtime, workspace, plans);
  }

  async summarize(workspace: ConvergenceWorkspace, plans: readonly ConvergencePlan[]): Promise<ConvergenceRunResult> {
    const events: ConvergenceRunEvent[] = [];
    const runId = `${workspace.id}:summary:${Date.now()}` as ConvergenceRunId;

    for await (const event of this.#runtime.run(workspace, plans)) {
      events.push(event);
    }

    return {
      ...buildResultFromEvents(runId, { ...workspace }, events),
      selectedPlan: plans[0],
      events,
    };
  }

  static planSequence(workspace: ConvergenceWorkspace): readonly ConvergencePlan[] {
    return workspace.plans.toSorted((left, right) => right.score - left.score);
  }
}
