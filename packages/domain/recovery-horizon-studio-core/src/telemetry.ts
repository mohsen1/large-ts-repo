import type { PluginStage, TimeMs, HorizonSignal, JsonLike } from '@domain/recovery-horizon-engine';
import { type StudioWorkspace, type ProfileId, type WorkspaceId, type StageRoute, asTime } from './types.js';

export type TelemetryLevel = 'trace' | 'info' | 'warn' | 'error';

export interface TelemetryRecord {
  readonly workspaceId: WorkspaceId;
  readonly profileId: ProfileId;
  readonly stage: PluginStage;
  readonly level: TelemetryLevel;
  readonly message: string;
  readonly route: StageRoute<PluginStage>;
  readonly emittedAt: TimeMs;
}

export interface WorkspaceTelemetry {
  readonly workspaceId: WorkspaceId;
  readonly profileId: ProfileId;
  readonly events: readonly TelemetryRecord[];
}

interface TelemetrySnapshot<T extends string> {
  readonly workspace: string;
  readonly profile: string;
  readonly mode: T;
  readonly events: readonly TelemetryRecord[];
}

const buildRoute = (stage: PluginStage, stageLabel: string): StageRoute<PluginStage> =>
  `${stage.toUpperCase()}/${stageLabel}` as StageRoute<PluginStage>;

class TelemetryScope {
  #closed = false;
  #events: TelemetryRecord[] = [];

  constructor(
    private readonly workspaceId: WorkspaceId,
    private readonly profileId: ProfileId,
  ) {}

  get closed() {
    return this.#closed;
  }

  push(record: Omit<TelemetryRecord, 'workspaceId' | 'profileId' | 'emittedAt'>): void {
    if (this.#closed) {
      throw new Error('telemetry scope closed');
    }
    this.#events.push({
      ...record,
      workspaceId: this.workspaceId,
      profileId: this.profileId,
      emittedAt: asTime(Date.now()),
      route: record.route,
    });
  }

  drain(): readonly TelemetryRecord[] {
    const events = [...this.#events];
    this.#events = [];
    return events.toReversed();
  }

  snapshot(): WorkspaceTelemetry {
    return {
      workspaceId: this.workspaceId,
      profileId: this.profileId,
      events: [...this.#events],
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }
}

export const createTelemetrySession = (
  workspaceId: WorkspaceId,
  profileId: ProfileId,
): { readonly session: TelemetryScope; readonly emit: (level: TelemetryLevel, message: string, stage: PluginStage) => void } => {
  const session = new TelemetryScope(workspaceId, profileId);
  const emit = (level: TelemetryLevel, message: string, stage: PluginStage) => {
    session.push({
      level,
      message,
      stage,
      route: buildRoute(stage, 'primary'),
    });
  };

  return { session, emit };
};

export const emitSignalTelemetry = <TKind extends PluginStage>(
  signal: HorizonSignal<TKind, JsonLike>,
  level: TelemetryLevel,
  workspaceId: WorkspaceId,
  profileId: ProfileId,
): TelemetryRecord => ({
  workspaceId,
  profileId,
  stage: signal.kind,
  level,
  route: `${signal.kind.toUpperCase()}/${String(signal.input.runId)}` as StageRoute<PluginStage>,
  message: `${signal.severity} signal from ${signal.kind}`,
  emittedAt: asTime(Date.now()),
});

export const telemetrySnapshot = async <T extends Record<string, unknown>>(
  workspace: StudioWorkspace,
  events: readonly TelemetryRecord[],
): Promise<TelemetrySnapshot<'current'> & T> => {
  const record = {
    workspace: workspace.workspaceId,
    profile: workspace.profileId,
    mode: 'current',
    events: events.toSorted((left, right) => right.emittedAt - left.emittedAt),
  } as TelemetrySnapshot<'current'>;
  return {
    ...record,
    ...events.reduce<Record<string, number>>((acc, event) => ({
      ...acc,
      [event.stage]: ((acc[event.stage] as number | undefined) ?? 0) + 1,
    }), {}),
  } as TelemetrySnapshot<'current'> & T;
};

export async function* watchTelemetry(
  session: TelemetryScope,
  signal: AbortSignal,
): AsyncGenerator<TelemetryRecord, void, void> {
  while (!signal.aborted) {
    const drained = session.drain();
    for (const event of drained.toSorted((left, right) => right.emittedAt - left.emittedAt)) {
      yield event;
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
}
