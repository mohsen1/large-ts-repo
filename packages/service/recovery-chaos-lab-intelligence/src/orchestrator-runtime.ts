import { fail, ok, type Result } from '@shared/result';
import {
  type ChaosRunReport,
  runChaosScenario,
  type RegistryLike,
  type StageBoundary
} from '@service/recovery-chaos-orchestrator';
import {
  collectFilteredSignals,
  streamSignalBatches,
  type SimulationSignalChunk,
  type SignalEnvelope,
  type SignalKind
} from '@domain/recovery-chaos-sim-models';
import {
  asRunToken,
  type ChaosRunToken
} from '@domain/recovery-chaos-sim-models';
import { asScenarioId } from '@domain/recovery-chaos-lab';

export type RuntimeConfig = {
  readonly dryRun: boolean;
  readonly signalBatchSize: number;
  readonly tags?: readonly string[];
  readonly preferredActions?: readonly string[];
  readonly signalFilter?: readonly string[];
};

export interface RuntimeState {
  readonly runToken: ChaosRunToken;
  readonly status: 'idle' | 'running' | 'done' | 'failed';
  readonly events: number;
  readonly startedAt: number;
}

export interface RuntimeRunInput<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace: string;
  readonly scenario: { id: string; stages: TStages };
  readonly registry: RegistryLike<TStages>;
  readonly config: RuntimeConfig;
}

export async function runScenarioWithReport<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  input: RuntimeRunInput<TStages>
): Promise<Result<ChaosRunReport<TStages>, Error>> {
  const runToken = asRunToken(`${input.namespace}:${input.scenario.id}`);
  const startedAt = Date.now();
  const state = buildRuntimeState('running', 0, runToken);

  await using stack = new AsyncDisposableStack();
  stack.defer(() => Promise.resolve());

  try {
    const report = await runChaosScenario(
      input.namespace,
      {
        namespace: input.namespace as never,
        id: asScenarioId(input.scenario.id),
        title: `${input.scenario.id}:runtime`,
        version: '1.0.0',
        stages: input.scenario.stages as TStages,
        createdAt: startedAt as never
      },
      input.registry,
      {
        dryRun: input.config.dryRun,
        signal: undefined,
        preferredActions: input.config.preferredActions,
        tags: input.config.tags
      } as never
    );
    return ok(report);
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('scenario execution failed'));
  } finally {
    void state;
  }
}

export function buildRuntimeState(
  status: RuntimeState['status'],
  eventCount: number,
  runToken: ChaosRunToken
): RuntimeState {
  return {
    runToken,
    status,
    events: eventCount,
    startedAt: Date.now()
  };
}

export function mapSignalsToBatches<T>(
  signals: readonly T[],
  batchSize = 8
): Promise<readonly SimulationSignalChunk<T>[]> {
  return streamSignalBatches(signals, { batchSize });
}

export async function collectSignalsByKind<T extends SignalEnvelope<unknown, SignalKind>>(
  signals: AsyncIterable<T>,
  includeKinds: readonly SignalKind[],
  limit = 1024
): Promise<T[]> {
  const entries = await collectFilteredSignals(signals, includeKinds, limit);
  return entries as T[];
}

export const runtimeDefaults = {
  dryRun: true,
  signalBatchSize: 32
} satisfies RuntimeConfig;

export async function runWithCleanup<T>(build: () => Promise<T>): Promise<Result<T, Error>> {
  await using stack = new AsyncDisposableStack();
  stack.defer(() => Promise.resolve());
  try {
    return ok(await build());
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('runtime failed'));
  }
}
