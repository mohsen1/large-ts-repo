import { ok, type Result } from '@shared/result';
import { buildPipelineResult } from '@domain/recovery-chaos-lab';
import {
  asNamespace,
  asRunId,
  asScenarioId,
  type ChaosScenarioDefinition,
  type EpochMs,
  type RunId,
  type StageBoundary
} from '@domain/recovery-chaos-lab';
import {
  type BaseChaosRunEvent,
  type ChaosRunEvent,
  type ChaosRunEventKind,
  type ChaosRunFinalEvent,
  type ChaosRunReport,
  type ChaosRunState,
  type ChaosSchedulerOptions,
  type ExecutionSummary,
  type RunContext,
  type PluginAdapter,
  type RegistryLike,
  type StageResultMap,
  type StageTrace
} from './types';
import { type ChaosRunStartedEvent, type ChaosStageEvent } from './types';

export interface ChaosOrchestratorEvents {
  readonly started: 'run-started';
  readonly stageStarted: 'stage-started';
  readonly stageComplete: 'stage-complete';
  readonly stageFailed: 'stage-failed';
  readonly completed: 'run-complete';
  readonly failed: 'run-failed';
}

export const eventKinds = {
  started: 'run-started',
  stageStarted: 'stage-started',
  stageComplete: 'stage-complete',
  stageFailed: 'stage-failed',
  completed: 'run-complete',
  failed: 'run-failed'
} as const satisfies ChaosOrchestratorEvents;

const clock = {
  now: () => Date.now(),
  sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (!signal) return;
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
};

function epochNow(): EpochMs {
  return clock.now() as EpochMs;
}

function createStartedEvent(runId: RunId): ChaosRunStartedEvent {
  return {
    runId,
    at: epochNow(),
    kind: 'run-started'
  };
}

function createFinalEvent(
  runId: RunId,
  kind: 'run-complete' | 'run-failed',
  snapshot: ReturnType<typeof buildPipelineResult>
): ChaosRunFinalEvent {
  const status: ChaosRunFinalEvent['status'] = kind === 'run-complete' ? 'complete' : 'failed';
  return {
    runId,
    at: epochNow(),
    kind,
    status,
    snapshot: {
      ...snapshot,
      runId,
      scenarioId: snapshot.scenarioId,
      namespace: snapshot.namespace,
      status
    }
  };
}

function createStageEvent<T extends string>(
  runId: RunId,
  kind: 'stage-started' | 'stage-complete' | 'stage-failed',
  stage: T,
  payload: Record<string, unknown>
): ChaosStageEvent<T> {
  return {
    runId,
    at: epochNow(),
    kind,
    stage,
    payload
  };
}

function createRunState(namespace: string, scenarioId: string): ChaosRunState {
  const now = epochNow();
  return {
    runId: asRunId(`${namespace}:${Date.now()}`),
    namespace: asNamespace(namespace),
    scenarioId: asScenarioId(scenarioId),
    status: 'arming',
    progress: 0,
    startedAt: now,
    updatedAt: now,
    trace: []
  };
}

async function callPlugin<TStage extends StageBoundary<string, unknown, unknown>>(
  adapter: PluginAdapter<TStage>,
  input: TStage['input'],
  context: RunContext
): Promise<Result<TStage['output']>> {
  await clock.sleep(1, context.signal);
  return adapter.execute(input, context);
}

function buildReport<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  state: ChaosRunState,
  stages: TStages,
  steps: StageResultMap<TStages>,
  trace: readonly StageTrace[],
  status: ChaosRunState['status']
): ChaosRunReport<TStages> {
  const snapshot = buildPipelineResult(
    {
      namespace: state.namespace,
      id: state.scenarioId,
      title: String(state.scenarioId),
      version: '1.0.0',
      stages: stages as TStages,
      createdAt: state.startedAt
    },
    status
  );

  return {
    runId: state.runId,
    namespace: state.namespace,
    scenarioId: state.scenarioId,
    status,
    progress: state.progress,
    snapshot: {
      ...snapshot,
      runId: state.runId,
      namespace: state.namespace,
      scenarioId: state.scenarioId
    },
    trace: trace as readonly StageTrace[],
    steps,
    finalAt: epochNow()
  };
}

export class ChaosOrchestrator<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly #state: ChaosRunState;
  readonly #stages: TStages;
  readonly #registry: RegistryLike<TStages>;
  readonly #options: ChaosSchedulerOptions;

  constructor(
    namespace: string,
    scenario: ChaosScenarioDefinition & { stages: TStages },
    registry: RegistryLike<TStages>,
    options: ChaosSchedulerOptions = {}
  ) {
    this.#state = createRunState(namespace, scenario.id);
    this.#stages = scenario.stages;
    this.#registry = registry;
    this.#options = options;
  }

  async *run(): AsyncGenerator<ChaosRunEvent, ChaosRunReport<TStages>> {
    const trace: StageTrace[] = [];
    const steps = {} as StageResultMap<TStages>;
    const runId = this.#state.runId;

    yield createStartedEvent(runId);

    for (let index = 0; index < this.#stages.length; index += 1) {
      const stage = this.#stages[index];
      const startedEvent = createStageEvent(runId, 'stage-started', stage.name, { cursor: index });
      trace.push({ stage: stage.name, startedAt: startedEvent.at, status: 'active' });
      this.#state.status = 'active';
      yield startedEvent;

      const adapter = this.#registry.get(stage.name);
      if (!adapter) {
        this.#state.status = 'failed';
        const failureEvent = createStageEvent(runId, 'stage-failed', stage.name, { reason: 'missing plugin' });
        trace.push({
          stage: stage.name,
          startedAt: startedEvent.at,
          endedAt: epochNow(),
          status: 'failed',
          error: 'missing plugin'
        });
        yield failureEvent;
        const report = buildReport(this.#state, this.#stages, steps, trace, 'failed');
        yield createFinalEvent(runId, 'run-failed', report.snapshot);
        return report;
      }

      const outcome = this.#options.dryRun
        ? ok(stage.output as never)
        : await callPlugin(
            adapter as unknown as PluginAdapter<StageBoundary<string, unknown, unknown>>,
            stage.input as never,
            this.#state
          );

      if (!outcome.ok) {
        this.#state.status = 'failed';
        const failed = createStageEvent(runId, 'stage-failed', stage.name, {
          error: String(outcome.error)
        });
        this.#state.updatedAt = epochNow();
        trace.push({
          stage: stage.name,
          startedAt: startedEvent.at,
          endedAt: epochNow(),
          status: 'failed',
          error: String(outcome.error)
        });
        yield failed;
        const report = buildReport(this.#state, this.#stages, steps, trace, 'failed');
        yield createFinalEvent(runId, 'run-failed', report.snapshot);
        return report;
      }

      (steps as Record<string, { output: unknown; at: EpochMs }>)[stage.name as string] = {
        output: outcome.value,
        at: epochNow()
      };

      trace.push({
        stage: stage.name,
        startedAt: startedEvent.at,
        endedAt: epochNow(),
        status: 'verified'
      });

      this.#state.progress = Math.round(((index + 1) / Math.max(this.#stages.length, 1)) * 100);
      this.#state.status = 'verified';
      this.#state.updatedAt = epochNow();
      yield createStageEvent(runId, 'stage-complete', stage.name, { output: outcome.value });
    }

    this.#state.status = 'complete';
    const report = buildReport(this.#state, this.#stages, steps, trace, 'complete');
    yield createFinalEvent(runId, 'run-complete', report.snapshot);
    return report;
  }

  runPreview(): Promise<ChaosRunReport<TStages>> {
    return runIterator(this.run());
  }
}

export async function runChaosScenario<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenario: ChaosScenarioDefinition & { stages: TStages },
  registry: RegistryLike<TStages>,
  options: ChaosSchedulerOptions = {}
): Promise<ChaosRunReport<TStages>> {
  const orchestrator = new ChaosOrchestrator(namespace, scenario, registry, options);
  return runIterator(orchestrator.run());
}

export async function streamChaosScenario<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenario: ChaosScenarioDefinition & { stages: TStages },
  registry: RegistryLike<TStages>,
  options: ChaosSchedulerOptions = {}
): Promise<{ readonly events: readonly ChaosRunEvent[]; readonly report: ChaosRunReport<TStages> }> {
  const orchestrator = new ChaosOrchestrator(namespace, scenario, registry, options);
  const iterator = orchestrator.run();
  const events: ChaosRunEvent[] = [];
  let report: ChaosRunReport<TStages> | undefined;

  while (true) {
    const result = await iterator.next();
    if (result.done) {
      report = result.value;
      break;
    }
    events.push(result.value);
  }

  if (!report) {
    throw new Error('run completed without report');
  }

  return { events, report };
}

export function summarizeEvents(events: readonly ChaosRunEvent[]): ExecutionSummary {
  const attempts = events.length;
  const failures = events.filter((event) => event.kind === eventKinds.stageFailed || event.kind === eventKinds.failed).length;
  const ordered = events.toSorted((lhs, rhs) => Number(lhs.at) - Number(rhs.at));
  const elapsedMs = ordered.reduce((sum, event, index) => {
    if (index === 0) {
      return sum;
    }
    return sum + Number(event.at) - Number(ordered[index - 1].at);
  }, 0);
  return { attempts, failures, elapsedMs };
}

export function createReportFromEvents<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  events: readonly ChaosRunEvent[]
): ChaosRunReport<T> {
  const terminal = events.at(-1);
  if (!terminal) {
    throw new Error('No terminal event emitted from run');
  }

  const fallback = buildReport(
    {
      runId: terminal.runId as RunId,
      namespace: '' as ReturnType<typeof asNamespace>,
      scenarioId: '' as ReturnType<typeof asScenarioId>,
      status: 'idle',
      progress: 0,
      startedAt: epochNow(),
      updatedAt: epochNow(),
      trace: []
    },
    [] as never,
    {} as StageResultMap<T>,
    [],
    terminal.kind === eventKinds.completed ? 'complete' : 'failed'
  );

  return {
    ...fallback,
    status: terminal.kind === eventKinds.completed ? 'complete' : 'failed',
    finalAt: epochNow(),
    snapshot:
      (terminal as ChaosRunFinalEvent | ChaosRunStartedEvent | ChaosStageEvent).kind.includes('run-') &&
      'snapshot' in terminal
        ? terminal.snapshot
        : fallback.snapshot
  };
}

async function runIterator<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  stream: AsyncGenerator<ChaosRunEvent, ChaosRunReport<TStages>, unknown>
): Promise<ChaosRunReport<TStages>> {
  const iterator = stream[Symbol.asyncIterator]();

  while (true) {
    const result = await iterator.next();
    if (result.done) {
      if (result.value) {
        return result.value;
      }
      throw new Error('iterator terminated without final report');
    }
  }
}

export function isRunning<T extends ChaosRunState>(
  state: T,
  kind: Exclude<ChaosRunState['status'], 'complete' | 'failed'>
): state is T & { status: typeof kind } {
  return state.status === kind;
}

export const eventKindList = [
  'run-started' as const,
  'stage-started' as const,
  'stage-complete' as const,
  'stage-failed' as const,
  'run-complete' as const,
  'run-failed' as const
] as const;

export type EventKindByIndex<TIndex extends number> = typeof eventKindList[TIndex];

export type AnyChaosEventKind = ChaosRunEventKind | (string & {});
