import { type ChaosRunState, type RegistryLike, type StageBoundary, runChaosScenario } from '@service/recovery-chaos-orchestrator';
import {
  collectFilteredSignals,
  streamSignalBatches,
  type SimulationSignalChunk,
  type SignalEnvelope,
  type SignalKind,
  asNamespace as asSimNamespace,
  toEpochMs as simToEpochMs,
  asRunToken,
  asScenarioId,
  asSimulationId,
  makeMarker
} from '@domain/recovery-chaos-sim-models';
import {
  asNamespace,
  asRunId,
  asScenarioId as brandScenarioId,
  toEpochMs
} from '@domain/recovery-chaos-lab';
import { pickBootstrapPlan } from '@service/recovery-chaos-lab-intelligence';

export interface ControlPlaneConfig {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly simulationId: string;
  readonly profileIndex: number;
  readonly dryRun: boolean;
  readonly windowMs: number;
}

export interface ControlPlaneEvent {
  readonly at: number;
  readonly kind: string;
  readonly payload: Record<string, unknown>;
}

export interface ControlPlaneResult {
  readonly events: readonly ControlPlaneEvent[];
  readonly report: Awaited<ReturnType<typeof runChaosScenario>>;
  readonly buckets: readonly SimulationSignalChunk<SignalEnvelope<ControlPlaneEvent, SignalKind>>[];
}

export interface ControlPlaneServiceState {
  readonly running: boolean;
  readonly lastError: string | null;
  readonly report: Awaited<ReturnType<typeof runChaosScenario>> | null;
}

export type ControlPlaneStream = AsyncGenerator<ControlPlaneEvent>;

const CONTROL_FILTERS = ['infra', 'platform', 'application', 'workflow', 'human'] as const;

function toSignalEnvelope(event: ControlPlaneEvent, namespace: string): SignalEnvelope<ControlPlaneEvent, SignalKind> {
  return {
    kind: 'infra::INFRA',
    priority: 1,
    namespace: asSimNamespace(namespace),
    simulationId: asSimulationId(`simulation-${event.at}`),
    scenarioId: asScenarioId(`scenario-${event.at}`),
    payload: event,
    at: simToEpochMs(Date.now())
  };
}

function toAsyncIterable<T>(values: readonly T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of values) {
        yield value;
      }
    }
  };
}

export function buildRuntimeConfig(namespace: string, profileIndex: number) {
  return pickBootstrapPlan(profileIndex).then((base) => ({
    ...base,
    namespace: asNamespace(namespace),
    simulationId: base.simulationId,
    scenarioId: base.scenarioId,
    runToken: asRunToken(`${namespace}:${base.simulationId}:${base.scenarioId}`)
  }));
}

export async function resolveControlPlan(config: {
  readonly namespace: string;
  readonly profileIndex: number;
  readonly windowMs: number;
}): Promise<{
  readonly namespace: string;
  readonly simulationId: string;
  readonly scenarioId: string;
  readonly token: string;
  readonly windowMs: number;
}> {
  const bootstrap = await buildRuntimeConfig(config.namespace, config.profileIndex);
  return {
    namespace: bootstrap.namespace,
    simulationId: bootstrap.simulationId,
    scenarioId: bootstrap.scenarioId,
    token: bootstrap.runToken,
    windowMs: Math.max(25_000, config.windowMs)
  };
}

export class ChaosControlPlaneService {
  #signalToken = 0;
  #state: ControlPlaneServiceState = { running: false, lastError: null, report: null };
  #stack: AsyncDisposableStack | null = null;

  get state(): ControlPlaneServiceState {
    return this.#state;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack?.disposeAsync();
    this.#stack = null;
    this.#state = { ...this.#state, running: false };
  }

  async *streamSignals(namespace: string, signals: readonly ControlPlaneEvent[]): AsyncGenerator<ControlPlaneEvent> {
    for (const event of signals) {
      yield event;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const marker = makeMarker(namespace, `scenario-${this.#signalToken}`, String(++this.#signalToken));
    const envelopes = signals.map((event) => toSignalEnvelope(event, namespace));
    const chunks = await streamSignalBatches(envelopes, { batchSize: 4 });

    for (const chunk of chunks) {
      for (const signal of chunk.signals) {
        yield {
          at: Number(signal.at),
          kind: signal.kind,
          payload: { ...signal.payload, marker }
        };
      }
    }
  }

  async run(
    config: Omit<ControlPlaneConfig, 'scenarioId' | 'simulationId'>,
    scenario: { id: string; stages: readonly StageBoundary<string, unknown, unknown>[] },
    registry: RegistryLike<readonly StageBoundary<string, unknown, unknown>[]>
  ): Promise<ControlPlaneResult> {
    this.#stack = new AsyncDisposableStack();
    this.#stack.defer(() => Promise.resolve());
    this.#state = { ...this.#state, running: true, lastError: null };

    const bootstrap = await buildRuntimeConfig(config.namespace, config.profileIndex);

    const eventFeed: readonly ControlPlaneEvent[] = [
      {
        at: Date.now(),
        kind: 'bootstrap',
        payload: {
          namespace: config.namespace,
          mode: bootstrap.mode,
          runToken: bootstrap.runToken
        }
      },
      {
        at: Date.now() + 10,
        kind: 'plan-selected',
        payload: {
          parallelism: bootstrap.parallelism,
          profileIndex: config.profileIndex
        }
      },
      {
        at: Date.now() + 20,
        kind: 'topology-ready',
        payload: { phases: ['ingest', 'safety', 'run', 'recover'] }
      }
    ];

    const signalPayloads = eventFeed.map((event) => toSignalEnvelope(event, config.namespace));
    const selected = await collectFilteredSignals(toAsyncIterable(signalPayloads), CONTROL_FILTERS, 1_000);
    const visibleEvents: ControlPlaneEvent[] = [];

    for await (const event of this.streamSignals(config.namespace, eventFeed)) {
      visibleEvents.push(event);
      if (event.kind === 'plan-selected') {
        break;
      }
    }

    const scenarioDefinition = {
      namespace: asNamespace(config.namespace),
      id: brandScenarioId(bootstrap.scenarioId),
      title: `profile:${bootstrap.mode}`,
      version: '1.0.0',
      stages: scenario.stages,
      createdAt: toEpochMs(new Date())
    } as const;

    const report = await runChaosScenario(config.namespace, scenarioDefinition, registry as never, {
      dryRun: config.dryRun,
      preferredActions: ['latency', 'throttle'],
      tags: ['control-plane']
    });

    const buckets = await streamSignalBatches(signalPayloads, {
      batchSize: Math.max(1, Math.min(16, Math.floor(config.windowMs / 1000)))
    });

    const events = visibleEvents
      .concat(eventFeed)
      .concat(
        selected.map((signal) => ({
          at: Number(signal.at),
          kind: signal.kind,
          payload: signal.payload as Record<string, unknown>
        }))
      );

    this.#state = {
      ...this.#state,
      running: false,
      report
    };

    return {
      events,
      report,
      buckets: buckets as readonly SimulationSignalChunk<SignalEnvelope<ControlPlaneEvent, SignalKind>>[]
    };
  }
}

export const noopState: ChaosRunState = {
  runId: asRunId('noop-run'),
  namespace: asNamespace('noop'),
  scenarioId: brandScenarioId('00000000-0000-0000-0000-000000000000'),
  status: 'idle',
  progress: 0,
  startedAt: toEpochMs(new Date(0)),
  updatedAt: toEpochMs(new Date(0)),
  trace: []
};
