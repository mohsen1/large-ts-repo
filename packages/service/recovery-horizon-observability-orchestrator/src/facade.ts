import { collectObservabilitySnapshot } from './runtime';
import type {
  ObservabilityPulseInput,
  ObservabilityPulseResult,
  ObservabilitySummary,
  ObservabilityQueryScope,
} from './types';
import { createRuntimeRegistry, createRegistrySnapshot } from './registry';
import { foldTimeline, type ObservabilityTimeline } from '@domain/recovery-horizon-observability';
import { type HorizonSignal, type PluginStage, type JsonLike } from '@domain/recovery-horizon-engine';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';

const defaultProfiles = ['default', 'high-fidelity', 'streaming', 'batch'] as const;
const defaultWindow = {
  tenantId: 'tenant-001',
  stageWindow: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const,
  minStageCount: 1,
  owner: 'console',
  profile: defaultProfiles[0],
} as const;

export interface ObservatoryFacade {
  readonly runPulse: (input: ObservabilityPulseInput) => Promise<Result<ObservabilityPulseResult>>;
  readonly listProfiles: () => Promise<readonly typeof defaultProfiles[number][]>;
  readonly queryTimeline: (
    tenantId: string,
    stageWindow: readonly PluginStage[],
  ) => Promise<Result<ObservabilityTimeline>>;
  readonly registrySnapshot: () => ReturnType<typeof createRegistrySnapshot>;
}

const queryTimeline = async (
  tenantId: string,
  stageWindow: readonly PluginStage[],
): Promise<Result<ObservabilityTimeline>> => {
  const result = await collectObservabilitySnapshot({
    tenantId,
    stageWindow,
    minStageCount: 1,
    owner: 'timeline',
    profile: 'default',
  });
  if (!result.ok) {
    return err(result.error);
  }
  const stages = result.value.trace.map((entry) => ({
    kind: entry,
    payload: {
      durationMs: 100,
      errorCount: 0,
      tags: ['timeline'],
      tenantId,
      profile: result.value.state.snapshotId,
    },
    input: {
      version: result.value.state.snapshotId,
      runId: result.value.state.runId,
      tenantId,
      stage: entry,
      tags: ['query'],
      metadata: { snapshot: result.value.state.snapshotId },
    },
    id: result.value.state.snapshotId,
    startedAt: `${Date.now()}`,
    severity: 'low',
  } as unknown as HorizonSignal<PluginStage, JsonLike>));
  return ok(
    foldTimeline(
      tenantId as unknown as Parameters<typeof foldTimeline>[0],
      stages as unknown as Parameters<typeof foldTimeline>[1],
    ),
  );
};

export const createObservabilityFacade = (): ObservatoryFacade => ({
  runPulse: async (input: ObservabilityPulseInput) => collectObservabilitySnapshot(input),
  listProfiles: async () => [...defaultProfiles],
  queryTimeline,
  registrySnapshot: () => {
    const registry = createRuntimeRegistry();
    const profile: ObservabilitySummary = {
      totalSignals: 0,
      totalErrors: 0,
      totalWindows: 0,
      stages: {
        ingest: 0,
        analyze: 0,
        resolve: 0,
        optimize: 0,
        execute: 0,
      },
    };
    void profile;
    return createRegistrySnapshot(registry);
  },
});

export const defaultWindowProfile = (): typeof defaultWindow => ({
  tenantId: defaultWindow.tenantId,
  stageWindow: [...defaultWindow.stageWindow],
  minStageCount: defaultWindow.minStageCount,
  owner: defaultWindow.owner,
  profile: defaultWindow.profile,
});

export const runObservabilityPulse = (
  input: ObservabilityQueryScope & { owner: string; profile: string; minStageCount?: number },
): Promise<Result<ObservabilityPulseResult>> =>
  createObservabilityFacade().runPulse({
    tenantId: input.tenantId,
    stageWindow: (input.stages ?? ['ingest', 'analyze', 'resolve', 'optimize', 'execute']) as readonly PluginStage[],
    owner: input.owner,
    profile: input.profile,
    minStageCount: input.minStageCount,
  });

export const collectDefaultPulse = (): Promise<Result<ObservabilityPulseResult>> =>
  runObservabilityPulse({
    tenantId: defaultWindow.tenantId,
    owner: defaultWindow.owner,
    profile: defaultWindow.profile,
    minStageCount: defaultWindow.minStageCount,
  });
