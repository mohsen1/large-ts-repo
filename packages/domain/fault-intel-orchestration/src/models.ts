import type { Brand, EventName, NoInfer, TemplatePath, PluginContext } from '@shared/fault-intel-runtime';

export type { NoInfer, PluginContext, Brand } from '@shared/fault-intel-runtime';

export type TenantId = Brand<string, 'FaultIntelTenantId'>;
export type CampaignId = Brand<string, 'FaultIntelCampaignId'>;
export type WorkspaceId = Brand<string, 'FaultIntelWorkspaceId'>;
export type OperatorId = Brand<string, 'FaultIntelOperatorId'>;

export type IncidentSeverity = 'notice' | 'advisory' | 'warning' | 'critical';
export type IncidentBand = 'green' | 'amber' | 'red' | 'violet';
export type CampaignStatus = 'created' | 'planning' | 'running' | 'finalized' | 'aborted';
export type PhaseType = 'intake' | 'triage' | 'remediation' | 'recovery' | 'postmortem';
export type Transport = 'mesh' | 'fabric' | 'cockpit' | 'orchestration' | 'console';

export type SeverityWeights = {
  readonly notice: 0.15;
  readonly advisory: 0.4;
  readonly warning: 0.65;
  readonly critical: 1;
};

export const severityWeights = {
  notice: 0.15,
  advisory: 0.4,
  warning: 0.65,
  critical: 1,
} as const satisfies SeverityWeights;

export type WeightedSeverity<T extends IncidentSeverity> = {
  readonly severity: T;
  readonly weight: typeof severityWeights[T];
};

export interface TaggedMetric {
  readonly key: string;
  readonly value: number;
  readonly unit: string;
  readonly tags: ReadonlySet<string>;
}

export interface IncidentSignal {
  readonly signalId: Brand<string, 'FaultIntelSignalId'>;
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly workspaceId: WorkspaceId;
  readonly transport: Transport;
  readonly observedAt: string;
  readonly detector: string;
  readonly severity: IncidentSeverity;
  readonly title: string;
  readonly detail: string;
  readonly metrics: readonly TaggedMetric[];
}

export interface CampaignObjective {
  readonly objectiveId: Brand<string, 'FaultIntelObjectiveId'>;
  readonly label: string;
  readonly description: string;
  readonly targetSloMs: number;
}

export interface CampaignPhase<TName extends PhaseType> {
  readonly phase: TName;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly operators: readonly OperatorId[];
  readonly notes: readonly string[];
}

export interface CampaignBlueprint<TPhases extends readonly PhaseType[]> {
  readonly campaignId: CampaignId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly phases: TPhases;
  readonly owners: readonly OperatorId[];
  readonly objectives: readonly CampaignObjective[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CampaignExecutionContext {
  readonly campaignId: CampaignId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly planId: Brand<string, 'FaultIntelPlanId'>;
  readonly operatorId: OperatorId;
  readonly startedAt: string;
  readonly traceId: Brand<string, 'FaultIntelTraceId'>;
}

export interface CampaignEnvelope {
  readonly type: EventName<string, string>;
  readonly source: TenantId;
  readonly payload: Readonly<{ campaign: CampaignBlueprint<readonly PhaseType[]>; context: CampaignExecutionContext }>;
  readonly createdAt: string;
}

export interface PluginPolicy {
  readonly policyId: Brand<string, 'FaultIntelPolicyId'>;
  readonly name: string;
  readonly description: string;
  readonly requiredStages: readonly PhaseType[];
  readonly requiredTransports: readonly Transport[];
  readonly maxConcurrency: number;
  readonly timeoutMs: number;
}

export interface CampaignRunTemplate {
  readonly campaignId: CampaignId;
  readonly tenantId: TenantId;
  readonly strategy: string;
  readonly policyIds: readonly Brand<string, 'FaultIntelPolicyId'>[];
  readonly createdBy: OperatorId;
  readonly constraints: Readonly<Record<string, unknown>>;
}

export type EventTemplate<Segments extends readonly string[]> = TemplatePath<Segments>;

export type RouteSegmentTuple<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? readonly [Head, ...RouteSegmentTuple<Tail>]
  : readonly [];

export type CampaignRoute<TBlueprint extends CampaignBlueprint<readonly PhaseType[]>> = EventTemplate<
  readonly ['campaign', ...RouteSegmentTuple<TBlueprint['phases']>]
>;

export interface CampaignManifest<TCampaign extends CampaignBlueprint<readonly PhaseType[]>> {
  readonly id: TCampaign['campaignId'];
  readonly tenantId: TCampaign['tenantId'];
  readonly blueprint: TCampaign;
  readonly tags: ReadonlySet<string>;
}

export type RouteByPhase<TBlueprint extends CampaignBlueprint<readonly PhaseType[]>> = {
  [K in TBlueprint['phases'][number]]: readonly CampaignPhase<K>[];
};

export interface CampaignPhaseIndex<TBlueprint extends CampaignBlueprint<readonly PhaseType[]>> {
  readonly route: CampaignRoute<TBlueprint>;
  readonly index: number;
}

export interface CampaignPhaseTransition<TBlueprint extends CampaignBlueprint<readonly PhaseType[]>> {
  readonly from: CampaignPhaseIndex<TBlueprint>;
  readonly to: CampaignPhaseIndex<TBlueprint>;
}

export interface CampaignRunResult {
  readonly campaign: CampaignBlueprint<readonly PhaseType[]>;
  readonly policy: PluginPolicy;
  readonly planId: Brand<string, 'FaultIntelPlanId'>;
  readonly signals: readonly IncidentSignal[];
  readonly executedAt: string;
  readonly riskScore: number;
}

export interface CampaignAdapterConfig<TName extends string, TTransport extends Transport> {
  readonly adapterName: TName;
  readonly transport: TTransport;
  readonly enabled: boolean;
}

export interface CampaignAdapterOutput<TConfig extends CampaignAdapterConfig<string, Transport>> {
  readonly transport: TConfig['transport'];
  readonly adapterName: TConfig['adapterName'];
  readonly signals: readonly IncidentSignal[];
}

export type CampaignAdapterMap = {
  [K in Transport]: CampaignAdapterConfig<K, K>;
};

export type FlattenMap<T> = T extends Record<string, infer U> ? U : never;

export type InferTemplateConfig<TAdapters extends readonly CampaignAdapterOutput<CampaignAdapterConfig<string, Transport>>[]> =
  TAdapters extends readonly [infer Head, ...infer Tail]
    ? Head extends CampaignAdapterOutput<CampaignAdapterConfig<string, Transport>>
      ? CampaignAdapterConfig<string, Head['transport']>['transport'] | InferTemplateConfig<Extract<Tail, readonly CampaignAdapterOutput<CampaignAdapterConfig<string, Transport>>[]>>
      : never
    : never;

export interface CampaignWorkspace {
  readonly workspaceId: WorkspaceId;
  readonly tenantId: TenantId;
  readonly operatorId: OperatorId;
  readonly campaignIds: readonly CampaignId[];
  readonly createdAt: string;
}

export interface CampaignWorkspaceSeed {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly operatorId: string;
}

export interface NamedRoute {
  readonly path: CampaignRoute<CampaignBlueprint<readonly PhaseType[]>>;
}

export interface CampaignTemplateRequest<TPhases extends readonly PhaseType[]> {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly phases: TPhases;
  readonly campaignSeed: string;
  readonly owner: string;
}

export interface CampaignTemplateOptions {
  readonly enforcePolicy?: boolean;
  readonly maxSignals?: number;
  readonly includeAllSignals?: boolean;
}

export type PolicyFromTemplate<TPolicy extends PluginPolicy> = {
  [K in keyof TPolicy as `policy.${K & string}`]: TPolicy[K];
};

export interface PluginTemplate {
  readonly stage: PhaseType;
  readonly transport: Transport;
  readonly name: string;
  readonly configSchema: Readonly<Record<string, unknown>>;
}

export type PluginTemplateMap<TTemplates extends readonly PluginTemplate[]> = {
  readonly [K in TTemplates[number] as K['name']]: K;
};

export type RouteFromTuple<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail
]
  ? `${Head & string}${Tail extends readonly [] ? '' : `.${RouteFromTuple<Tail>}`}`
  : never;

export type RecursiveSignalList<T extends readonly IncidentSignal[]> = T extends readonly [
  infer Head,
  ...infer Tail extends readonly IncidentSignal[]
]
  ? readonly [Head & IncidentSignal, ...RecursiveSignalList<Tail>]
  : readonly [];

export const asTenantId = (value: string): TenantId => value as TenantId;
export const asCampaignId = (value: string): CampaignId => value as CampaignId;
export const asWorkspaceId = (value: string): WorkspaceId => value as WorkspaceId;
export const asPlanId = (value: string): CampaignExecutionContext['planId'] => value as CampaignExecutionContext['planId'];

export const resolveRouteFromPhases = <TPhases extends readonly PhaseType[]>(phases: TPhases): RouteFromTuple<TPhases> =>
  phases.join('.') as RouteFromTuple<TPhases>;

export const normalizeCampaignRequest = <TPhases extends readonly PhaseType[]>(
  request: CampaignTemplateRequest<TPhases>,
): CampaignTemplateRequest<NoInfer<TPhases>> => ({
  tenantId: request.tenantId,
  workspaceId: request.workspaceId,
  phases: request.phases,
  campaignSeed: request.campaignSeed.trim(),
  owner: request.owner.trim(),
} satisfies CampaignTemplateRequest<TPhases>);
