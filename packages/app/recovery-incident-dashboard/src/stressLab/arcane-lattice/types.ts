import type { Brand, DeepReadonly, NoInfer, PathTuple, PathValue, RecursivePath } from '@shared/type-level';

type ArcaneWorkspaceEventType = Extract<ArcaneEventType, `workspace/${string}`>;
type ArcanePluginEventType = Extract<ArcaneEventType, `plugin/${string}`>;

export type ArcaneTenantId = Brand<string, 'ArcaneTenantId'>;
export type ArcaneWorkspaceId = Brand<string, 'ArcaneWorkspaceId'>;
export type ArcaneRunId = Brand<string, 'ArcaneRunId'>;
export type ArcaneSessionId = Brand<string, 'ArcaneSessionId'>;
export type ArcanePluginId = Brand<string, 'ArcanePluginId'>;
export type ArcaneChannelId = Brand<string, 'ArcaneChannelId'>;
export type CommandRunbookId = Brand<string, 'ArcaneCommandRunbookId'>;
export type RecoverySignalId = Brand<string, 'ArcaneRecoverySignalId'>;

export type TenantId = ArcaneTenantId;

export type ArcanePluginKind =
  | 'predictive'
  | 'decision'
  | 'playbook'
  | 'telemetry'
  | 'policy'
  | 'signal';

export type ArcanePhase = 'observe' | 'diagnose' | 'plan' | 'isolate' | 'migrate' | 'restore' | 'verify';
export type ArcaneStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'ready'
  | 'blocked'
  | 'completed'
  | 'failed';
export type ArcaneSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ArcaneTelemetryBand = 'p50' | 'p95' | 'p99';
export type ArcanePriority = 1 | 2 | 3 | 4 | 5;
export type ArcaneCapability = `${ArcanePluginKind}-${'core' | 'edge' | 'control' | 'audit'}`;
export type ArcaneRoute = `${ArcanePhase}/${ArcanePluginKind}/${string}`;

export type ArcaneNamespace = Brand<string, 'ArcaneNamespace'>;

export type ArcaneEventType =
  | 'workspace/start'
  | 'workspace/pause'
  | 'workspace/resume'
  | 'workspace/stop'
  | 'workspace/refresh'
  | 'plugin/selected'
  | 'plugin/filtered';

export interface ArcanePluginManifest<TKind extends ArcanePluginKind = ArcanePluginKind, TRoute extends string = ArcaneRoute> {
  readonly pluginId: ArcanePluginId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly kind: TKind;
  readonly capabilities: readonly ArcaneCapability[];
  readonly route: TRoute;
  readonly phaseCoverage: readonly ArcanePhase[];
  readonly priority: ArcanePriority;
  readonly tags: Readonly<Record<string, string>>;
  readonly createdAt: string;
}

export interface ArcanePluginInputEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly tenantId: TenantId;
  readonly workspaceId: ArcaneWorkspaceId;
  readonly runbookIds: readonly CommandRunbookId[];
  readonly payload: DeepReadonly<TPayload>;
}

export interface ArcaneWorkspaceInputPayload extends Record<string, unknown> {
  readonly selectedKinds: readonly ArcanePluginKind[];
  readonly signalIds: readonly RecoverySignalId[];
  readonly namespace: ArcaneNamespace;
}

export interface ArcanePluginContext<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  readonly tenantId: TenantId;
  readonly workspaceId: ArcaneWorkspaceId;
  readonly runId: ArcaneRunId;
  readonly status: ArcaneStatus;
  readonly activeRoute: ArcaneRoute;
  readonly channel: ArcaneChannelId;
  readonly metadata: DeepReadonly<TMeta>;
}

export interface ArcanePluginResult<TPayload = unknown> {
  readonly ok: boolean;
  readonly value?: TPayload;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  readonly diagnostics: readonly {
    readonly code: string;
    readonly message: string;
    readonly severity: ArcaneSeverity;
  }[];
  readonly telemetry: {
    readonly pluginId: ArcanePluginId;
    readonly elapsedMs: number;
    readonly traceId: ArcaneSessionId;
    readonly attempts: readonly CommandRunbookId[];
    readonly latencyBand: ArcaneTelemetryBand;
  };
}

export interface ArcanePlugin<
  TInput = unknown,
  TOutput = unknown,
  TKind extends ArcanePluginKind = ArcanePluginKind,
> {
  readonly manifest: ArcanePluginManifest<TKind>;
  readonly run: (input: NoInfer<TInput>, context: NoInfer<ArcanePluginContext>) => Promise<ArcanePluginResult<TOutput>>;
}

export type ArcaneCatalogKind<TCatalog extends readonly ArcanePlugin[]> = TCatalog[number]['manifest']['kind'];

export type ArcaneCatalogMap<TCatalog extends readonly ArcanePlugin[]> = {
  [K in ArcaneCatalogKind<TCatalog>]: readonly Extract<TCatalog[number], { readonly manifest: { readonly kind: K } }>[];
} & {
  readonly [kind: string]: readonly ArcanePlugin[];
};

export type ArcaneInputOf<
  TCatalog extends readonly ArcanePlugin[],
  TKind extends ArcaneCatalogKind<TCatalog>,
> = Extract<TCatalog[number], { readonly manifest: { readonly kind: TKind } }> extends ArcanePlugin<infer TInput, any>
  ? TInput
  : never;

export type ArcaneOutputOf<
  TCatalog extends readonly ArcanePlugin[],
  TKind extends ArcaneCatalogKind<TCatalog>,
> = Extract<TCatalog[number], { readonly manifest: { readonly kind: TKind } }> extends ArcanePlugin<any, infer TOutput>
  ? TOutput
  : never;

export type FlattenTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly unknown[]
    ? [...FlattenTuple<Head>, ...FlattenTuple<Tail>]
    : [Head, ...FlattenTuple<Tail>]
  : [];

export type RecursiveEventPaths<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${K}` | `${K}.${RecursiveEventPaths<T[K]> & string}`
        : `${K}`;
    }[keyof T & string]
  : never;

export type EventPayloadShape<TKind extends ArcaneEventType, TPayload extends Record<string, unknown>> =
  TKind extends `workspace/${string}`
    ? {
        readonly workspaceId: ArcaneWorkspaceId;
        readonly at: string;
        readonly payload: TPayload;
      }
    : {
        readonly workspaceId: ArcaneWorkspaceId;
        readonly at: string;
        readonly pluginId: ArcanePluginId;
        readonly kindFilter: ArcanePluginKind;
        readonly payload: TPayload;
      };

export type ArcaneWorkspaceEvent<
  TKind extends ArcaneEventType = ArcaneEventType,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly type: TKind;
  readonly tenantId: TenantId;
} & EventPayloadShape<TKind, TPayload>;

export interface ArcaneWorkspaceConfig {
  readonly tenantId: TenantId;
  readonly workspaceId: ArcaneWorkspaceId;
  readonly namespace: ArcaneNamespace;
  readonly windowSizeMinutes: number;
  readonly allowAutoRetry: boolean;
  readonly includeForecasts: boolean;
}

export interface ArcaneRuntimeEvent {
  readonly tenantId: TenantId;
  readonly pluginId: ArcanePluginId;
  readonly kind: ArcanePluginKind;
  readonly at: string;
  readonly status: ArcaneStatus;
  readonly source: ArcaneSessionId;
  readonly workspaceId: ArcaneWorkspaceId;
  readonly confidence?: number;
}

export interface ArcaneManifest {
  readonly namespace: ArcaneNamespace;
  readonly namespaceRoute: ArcaneRoute;
  readonly workspaceId: ArcaneWorkspaceId;
  readonly createdAt: string;
  readonly pluginKindOrder: readonly ArcanePluginKind[];
  readonly pluginCountHint: number;
  readonly defaultPriority: ArcanePriority;
  readonly tags: Readonly<Record<string, string>>;
  readonly tagsByKind: readonly {
    readonly kind: ArcanePluginKind;
    readonly capability: ArcaneCapability;
  }[];
  readonly plugins: readonly ArcanePluginManifest[];
  readonly workspaceConfig: ArcaneWorkspaceConfig;
}

export interface ArcaneWorkspaceState {
  readonly tenantId: TenantId;
  readonly workspaceId: ArcaneWorkspaceId;
  readonly namespace: ArcaneNamespace;
  readonly runId: ArcaneRunId;
  readonly sessionId: ArcaneSessionId;
  readonly status: ArcaneStatus;
  readonly namespaceRoute: string;
  readonly config: ArcaneWorkspaceConfig;
  readonly signalIds: readonly RecoverySignalId[];
  readonly runbookIds: readonly CommandRunbookId[];
  readonly selectedPluginKinds: readonly ArcanePluginKind[];
  readonly createdAt: string;
}

export interface ArcaneWorkspaceStateDiff {
  readonly workspace?: Partial<ArcaneWorkspaceState>;
  readonly timeline?: readonly ArcaneWorkspaceAction[];
}

export interface ArcaneWorkspaceAction {
  readonly id: string;
  readonly type: ArcaneEventType;
  readonly workspaceId: ArcaneWorkspaceId;
  readonly at: string;
  readonly tenantId: TenantId;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export type ArcanePluginAdapter = {
  readonly name: string;
  readonly input: unknown;
  readonly weight: number;
};

export const createTenantId = (value: string): TenantId => value as TenantId;
export const createWorkspaceId = (value: string): ArcaneWorkspaceId => value as ArcaneWorkspaceId;
export const createRunId = (value: string): ArcaneRunId => value as ArcaneRunId;
export const createSessionId = (value: string): ArcaneSessionId => value as ArcaneSessionId;
export const createPluginId = (value: string): ArcanePluginId => value as ArcanePluginId;
export const createChannelId = (value: string): ArcaneChannelId => value as ArcaneChannelId;
export const createRouteNamespace = (value: string): ArcaneNamespace => `ns:${value}` as ArcaneNamespace;

export const createArcaneRunId = createRunId;
export const createArcaneSessionId = createSessionId;

export const normalizeWindow = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(720, Math.floor(value)));
};

export const ensurePriority = (value: number): ArcanePriority => {
  const bounded = Math.min(5, Math.max(1, value));
  return Math.trunc(bounded) as ArcanePriority;
};

export const inferPluginPayload = (workspace: ArcaneWorkspaceState): ArcanePluginInputEnvelope<ArcaneWorkspaceInputPayload> => ({
  tenantId: workspace.tenantId,
  workspaceId: workspace.workspaceId,
  runbookIds: workspace.runbookIds,
  payload: {
    selectedKinds: [...workspace.selectedPluginKinds],
    signalIds: [...workspace.signalIds],
    namespace: workspace.namespace,
  },
});

export const buildWorkspaceEvent = <TKind extends ArcaneWorkspaceEventType, TPayload extends Record<string, unknown> = Record<string, unknown>>(
  tenantId: TenantId,
  type: TKind,
  workspaceId: ArcaneWorkspaceId,
  payload: TPayload = {} as TPayload,
): ArcaneWorkspaceEvent<TKind, TPayload> => {
  return {
    type,
    tenantId,
    workspaceId,
    at: new Date().toISOString(),
    payload: payload as TPayload,
  } as ArcaneWorkspaceEvent<TKind, TPayload>;
};

export const buildPluginEvent = <TKind extends ArcanePluginEventType, TPayload extends Record<string, unknown> = Record<string, unknown>>(
  tenantId: TenantId,
  type: TKind,
  workspaceId: ArcaneWorkspaceId,
  pluginId: ArcanePluginId,
  kindFilter: ArcanePluginKind,
  payload: TPayload = {} as TPayload,
): ArcaneWorkspaceEvent<TKind, TPayload> => {
  return {
    type,
    tenantId,
    workspaceId,
    pluginId,
    kindFilter,
    at: new Date().toISOString(),
    payload: payload as TPayload,
  } as ArcaneWorkspaceEvent<TKind, TPayload>;
};

export const isWorkspaceEventOfType = <TKind extends ArcaneEventType>(
  event: ArcaneWorkspaceEvent,
  kind: TKind,
): event is ArcaneWorkspaceEvent<TKind> => event.type === kind;

export const arcaneWorkspaceStateDefaults = (
  tenantId: TenantId,
  overrides: Partial<ArcaneWorkspaceState> = {},
): ArcaneWorkspaceState => ({
  tenantId,
  workspaceId: createWorkspaceId(`${tenantId}-workspace`),
  namespace: createRouteNamespace('core'),
  runId: createRunId(`${tenantId}-run`),
  sessionId: createSessionId(`${tenantId}-session`),
  status: 'idle',
  namespaceRoute: `w/${tenantId}`,
  config: {
    tenantId,
    workspaceId: createWorkspaceId(`${tenantId}-workspace`),
    namespace: createRouteNamespace('core'),
    windowSizeMinutes: 30,
    allowAutoRetry: true,
    includeForecasts: true,
  },
  signalIds: [],
  runbookIds: [],
  selectedPluginKinds: ['predictive', 'decision'],
  createdAt: new Date().toISOString(),
  ...overrides,
});

export const toWorkspaceStateAction = (event: ArcaneWorkspaceEvent): ArcaneWorkspaceAction => ({
  id: crypto.randomUUID?.() ?? `${Date.now()}-${event.type}`,
  type: event.type,
  workspaceId: event.workspaceId,
  at: event.at,
  tenantId: event.tenantId,
  payload: event.payload,
});

export const toTelemetryLabel = (signal: RecoverySignalId): string => {
  return `${signal}:severity=${signal.length}`;
};

export const pickTopSignals = <T extends readonly RecoverySignalId[]>(signals: T, limit: number): T => {
  const max = Math.max(0, Math.min(signals.length, Math.trunc(limit)));
  return signals.slice(0, max) as unknown as T;
};

export const asWorkspaceState = (tenantId: string): ArcaneWorkspaceState => arcaneWorkspaceStateDefaults(createTenantId(tenantId));

export const arcaneTemplateCatalog = {
  namespace: 'recovery-arcane-lab',
  route: 'observe/predictive/core',
  tags: ['pilot', 'forecast', 'slo'],
} as const satisfies { readonly namespace: string; readonly route: string; readonly tags: readonly string[] };

export const mergePayloadPaths = <T extends Record<string, unknown>>(
  _payload: T,
): { readonly [K in RecursivePath<T>]: PathValue<T, K> } => {
  return {} as { readonly [K in RecursivePath<T>]: PathValue<T, K> };
};

export const pathIndex = <T>(value: T): PathTuple<T> => {
  return [] as unknown as PathTuple<T>;
};
