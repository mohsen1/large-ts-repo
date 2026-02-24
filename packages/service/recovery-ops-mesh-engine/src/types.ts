import type {
  MeshNodeContract,
  MeshNodeId,
  MeshPayloadFor,
  MeshPlanId,
  MeshPriority,
  MeshRunId,
  MeshSignalKind,
  MeshSignalPayloadFor,
  MeshTopology,
} from '@domain/recovery-ops-mesh';

export type {
  MeshPriority,
  MeshRunId,
  MeshPlanId,
  MeshTopology,
  MeshNodeContract,
  MeshNodeId,
  MeshSignalKind,
  MeshSignalPayloadFor,
  MeshPayloadFor,
};

export type EngineRunToken = string & { readonly __brand: 'engine-run-token' };
export type EngineAdapterId = string & { readonly __brand: 'engine-adapter-id' };

export interface MeshRunRequest {
  readonly topologyId: MeshPlanId;
  readonly runId: MeshRunId;
  readonly plan: MeshTopology;
  readonly signal: MeshPayloadFor<MeshSignalKind>;
  readonly options?: {
    readonly priority?: MeshPriority;
    readonly requireHistory?: boolean;
  };
}

export interface MeshRunArtifact {
  readonly runId: MeshRunId;
  readonly adapter: EngineAdapterId;
  readonly startedAt: number;
  readonly state: 'queued' | 'executing' | 'done' | 'error';
  readonly emitted: number;
  readonly errors: number;
}

export interface MeshRuntimeCommand<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly id: string & { readonly __brand: `mesh-cmd-${TSignal}` };
  readonly topologyId: MeshPlanId;
  readonly sourceNodeId: MeshNodeId;
  readonly signal: MeshPayloadFor<TSignal>;
  readonly priority: MeshPriority;
}

export interface MeshEngineAdapter {
  readonly adapterId: EngineAdapterId;
  readonly displayName: string;
  readonly capabilities: readonly MeshSignalKind[];
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  execute<TSignal extends MeshSignalKind>(command: MeshRuntimeCommand<TSignal>): Promise<MeshPayloadFor<TSignal>[]>;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface MeshExecutionContext {
  readonly token: EngineRunToken;
  readonly runId: MeshRunId;
  readonly startedAt: number;
  readonly nodes: readonly MeshNodeContract[];
}

export interface MeshTimelineEvent {
  readonly eventId: string & { readonly __brand: 'mesh-timeline-event' };
  readonly at: number;
  readonly nodeId: MeshNodeId;
  readonly kind: MeshSignalKind;
  readonly payload: MeshSignalPayloadFor<MeshSignalKind>;
}

export type MeshTimelineEvents = readonly MeshTimelineEvent[];

export type MeshEnginePlan<TTopology extends MeshTopology = MeshTopology> = Readonly<{
  topology: TTopology;
  adapterIds: readonly EngineAdapterId[];
  commandQueue: readonly MeshRuntimeCommand[];
  timeline: MeshTimelineEvents;
}>;

export type EnginePlanSummary = {
  readonly planId: MeshPlanId;
  readonly queued: number;
  readonly queuedKinds: Record<MeshSignalKind, number>;
  readonly topNodes: readonly MeshNodeId[];
};

export interface EngineEnvelope<TPayload = unknown> {
  readonly id: string & { readonly __brand: 'mesh-engine-envelope' };
  readonly payload: TPayload;
  readonly emittedAt: number;
  readonly runId: MeshRunId;
  readonly source: EngineAdapterId;
}

export type MeshEngineState = {
  active: number;
  queued: number;
  completed: number;
  failed: number;
};

export interface EngineWorkItem {
  readonly id: EngineRunToken;
  readonly command: MeshRuntimeCommand;
  readonly deadlineAt: number;
}

export interface EngineReport {
  readonly run: MeshRunArtifact;
  readonly context: MeshExecutionContext;
  readonly chunkCount: number;
}

export type MeshAdapterSignalCapabilities<T extends MeshSignalKind = MeshSignalKind> = readonly T[];
