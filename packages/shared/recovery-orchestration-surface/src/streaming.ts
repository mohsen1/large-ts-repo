import type {
  SurfaceLaneId,
  SurfaceRuntimeContext,
  SurfaceSignalId,
  SurfaceWorkspaceId,
} from './identity';
import type { SurfaceSignalEnvelope } from './contracts';

type SurfaceSignalHandler = (envelope: SurfaceSignalEnvelope) => Promise<void> | void;

type SignalStreamSeed = {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly laneId: SurfaceLaneId;
};

const randomSignalSuffix = (seed: string): string => {
  let value = 0x6d2b79f5;
  for (let index = 0; index < seed.length; index += 1) {
    const char = seed.charCodeAt(index);
    value ^= (value << 5) + char + (value >> 2);
  }
  return Math.abs(value).toString(36);
};

const buildSignal = (
  workspaceId: SurfaceWorkspaceId,
  laneId: SurfaceLaneId,
  kind: SurfaceSignalEnvelope['kind'],
  index: number,
): SurfaceSignalEnvelope => ({
  signalId: `${workspaceId}:signal:${laneId}:${kind}:${index}` as SurfaceSignalId,
  kind,
  workspaceId,
  generatedAt: Date.now() + index,
  value: {
    sequence: index,
    lane: laneId,
    token: randomSignalSuffix(`${workspaceId}:${laneId}:${index}`),
  },
  ttlSeconds: 300,
});

export async function* streamSignals(seed: SignalStreamSeed, iterations = 8): AsyncGenerator<SurfaceSignalEnvelope> {
  const kinds: readonly SurfaceSignalEnvelope['kind'][] = ['tick', 'state', 'health', 'artifact', 'audit'];
  for (let index = 0; index < iterations; index += 1) {
    const kind = kinds[index % kinds.length];
    const value = buildSignal(seed.workspaceId, seed.laneId, kind, index);
    await new Promise((resolve) => setTimeout(resolve, 35));
    yield value;
  }
}

const signalHandlers: Record<SurfaceSignalEnvelope['kind'], SurfaceSignalHandler> = {
  tick: async (signal) => {
    void signal.generatedAt;
  },
  state: async (signal) => {
    void signal.value;
  },
  health: async (signal) => {
    void signal.ttlSeconds;
  },
  artifact: async (signal) => {
    void signal.kind;
  },
  audit: async (signal) => {
    void signal.signalId;
  },
};

export const dispatchSignals = async (signals: AsyncIterable<SurfaceSignalEnvelope>): Promise<void> => {
  const handlers = Object.entries(signalHandlers) as Array<[
    SurfaceSignalEnvelope['kind'],
    SurfaceSignalHandler,
  ]>;

  for await (const signal of signals) {
    const handler = handlers.find(([key]) => key === signal.kind)?.[1];
    if (handler) {
      await handler(signal);
    }
  }
};

export interface SurfaceSignalReplay {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly laneId: SurfaceLaneId;
  readonly signalIds: readonly SurfaceSignalId[];
  readonly values: readonly SurfaceSignalEnvelope['value'][];
}

const defaultReplaySeed = {
  workspaceId: 'workspace:default-global' as SurfaceWorkspaceId,
  laneId: 'lane:realtime' as SurfaceLaneId,
};

export const DEFAULT_REPLAY_CONTEXT: SurfaceRuntimeContext = {
  workspaceId: defaultReplaySeed.workspaceId,
  lane: defaultReplaySeed.laneId,
  stage: 'bootstrap',
  metadata: {
    tenant: 'acme-core',
    domain: 'recovery',
    namespace: 'runtime',
    region: 'us-east-1',
    createdAt: Date.now(),
    createdBy: 'recovery-orchestration-surface',
  },
  createdAt: Date.now(),
};

export const replaySignals = async (
  seed: SignalStreamSeed = defaultReplaySeed,
): Promise<SurfaceSignalReplay> => {
  const signalIds: SurfaceSignalId[] = [];
  const values: SurfaceSignalEnvelope['value'][] = [];

  for await (const signal of streamSignals(seed, 12)) {
    if (signalIds.includes(signal.signalId)) {
      continue;
    }
    signalIds.push(signal.signalId);
    values.push(signal.value);
  }

  return {
    workspaceId: seed.workspaceId,
    laneId: seed.laneId,
    signalIds,
    values,
  };
};
