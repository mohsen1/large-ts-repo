import { Brand, normalizeLimit, withBrand } from '@shared/core';
import { type NoInfer } from '@shared/type-level';
import {
  createSignalId,
  createStepId,
  createTenantId,
  createStageAttemptId,
  type CommandRunbook,
  type RecoverySignal,
  type RecoverySignalId,
  type SeverityBand,
  type StageAttempt,
  type TenantId,
} from '../models';

export type CampaignKind =
  | 'discovery'
  | 'modeling'
  | 'orchestration'
  | 'simulation'
  | 'verification';

export type CampaignPhase =
  | 'seed'
  | 'discovery'
  | 'modeling'
  | 'orchestration'
  | 'simulation'
  | 'verification'
  | 'review';

export type CampaignId = Brand<string, 'CampaignId'>;
export type CampaignSessionId = Brand<string, 'CampaignSessionId'>;
export type CampaignBundleId = Brand<string, 'CampaignBundleId'>;
export type CampaignPluginId = Brand<string, 'CampaignPluginId'>;
export type CampaignSchemaVersion = readonly [number, number, number];
export type CampaignRouteToken<TLabel extends string = string> = `${CampaignId}.${CampaignKind}.${CampaignPhase}.${TLabel}`;
export type CampaignNamespace<TPrefix extends string = 'stress-lab'> = `${TPrefix}::campaign`;

export type CampaignRoute<TPath extends string> = TPath extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...CampaignRoute<Tail>]
  : readonly [TPath];

export type CampaignEventName<TCampaign extends string = string, TRoute extends string = string> = `${CampaignNamespace}:${TCampaign}:${TRoute}`;

export interface CampaignTraceEvent {
  readonly timestamp: string;
  readonly route: CampaignRoute<'discovery/modeling/orchestration'>;
  readonly phase: CampaignPhase;
  readonly tenantId: TenantId;
}

export interface CampaignSeedWindow {
  readonly index: number;
  readonly durationMinutes: number;
  readonly intensity: number;
}

export interface CampaignSeed {
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly title: string;
  readonly bundleId: CampaignBundleId;
  readonly windows: readonly CampaignSeedWindow[];
  readonly route: readonly string[];
  readonly labels: readonly string[];
  readonly requiredSignals: readonly RecoverySignalId[];
  readonly expectedDurationMinutes?: number;
}

export interface CampaignWorkspaceState {
  readonly tenantId: TenantId;
  readonly campaignId: CampaignSessionId;
  readonly plan: readonly CommandRunbook[];
  readonly phase: CampaignPhase;
  readonly selectedSignals: readonly RecoverySignal[];
  readonly topologyNodeCount: number;
  readonly topologyEdgeCount: number;
  readonly severity: SeverityBand;
  readonly readyAt: string;
}

export interface CampaignContextState {
  readonly tenantId: TenantId;
  readonly campaignId: CampaignSessionId;
  readonly activePhase: CampaignPhase;
  readonly route: CampaignRoute<'campaign/run'>;
  readonly tags: readonly string[];
}

export interface CampaignPluginManifest<TKind extends CampaignKind = CampaignKind> {
  readonly tenantId: TenantId;
  readonly pluginId: CampaignPluginId;
  readonly kind: TKind;
  readonly phase: CampaignPhase;
  readonly bundleId: CampaignBundleId;
  readonly namespace: CampaignNamespace;
  readonly labels: readonly string[];
}

export interface CampaignPlugin<
  TInput = unknown,
  TOutput = unknown,
  TContext extends CampaignContextState = CampaignContextState,
  TKind extends CampaignKind = CampaignKind,
> extends CampaignPluginManifest<TKind> {
  readonly runbook: readonly CampaignBundleId[];
  readonly version: CampaignSchemaVersion;
  run(input: NoInfer<TInput>, context: NoInfer<TContext>): Promise<TOutput>;
}

export interface CampaignStageTemplate {
  readonly stage: CampaignPhase;
  readonly label: string;
  readonly weight: number;
  readonly notes: readonly string[];
  readonly requiredSignals: readonly RecoverySignalId[];
}

export interface CampaignBudgetWindow {
  readonly windowId: Brand<string, 'CampaignWindowBudgetId'>;
  readonly minimumMs: number;
  readonly maximumMs: number;
  readonly concurrency: number;
}

export interface CampaignBudget {
  readonly tenantId: TenantId;
  readonly route: readonly string[];
  readonly windows: readonly CampaignBudgetWindow[];
}

export interface CampaignTelemetry {
  readonly phase: CampaignPhase;
  readonly route: readonly CampaignRouteToken[];
  readonly severity: SeverityBand;
  readonly metrics: Record<string, number>;
}

export type CampaignRouteIndex = CampaignRoute<'discovery/modeling/orchestration'>;

export type CampaignStageMap<T extends Record<string, CampaignPhase>> = {
  [K in keyof T as `${CampaignKind}:${K & string}`]: T[K];
};

export type PluginCatalogKind<TCatalog extends readonly CampaignPlugin[]> = TCatalog[number]['kind'];

export type PluginInputOf<
  TCatalog extends readonly CampaignPlugin[],
  TKind extends PluginCatalogKind<TCatalog>,
> = Extract<TCatalog[number], { readonly kind: TKind }> extends CampaignPlugin<infer TInput, any, any, TKind>
  ? TInput
  : never;

export type PluginOutputOf<
  TCatalog extends readonly CampaignPlugin[],
  TKind extends PluginCatalogKind<TCatalog>,
> = Extract<TCatalog[number], { readonly kind: TKind }> extends CampaignPlugin<any, infer TOutput, any, TKind>
  ? TOutput
  : never;

export type CampaignPluginInput<TCatalog extends readonly CampaignPlugin[], TKind extends PluginCatalogKind<TCatalog>> = NoInfer<
  PluginInputOf<TCatalog, TKind>
>;

export type CampaignPluginOutput<TCatalog extends readonly CampaignPlugin[], TKind extends PluginCatalogKind<TCatalog>> = PluginOutputOf<
  TCatalog,
  TKind
>;

export type CampaignStageSignalMatrix<TSignals extends readonly RecoverySignal[]> = {
  [K in TSignals[number]['id'] as `signal:${K & string}`]: TSignals[number] & { readonly id: K };
};

export type CampaignPlanOptions = {
  readonly tenantId: TenantId;
  readonly bundleId: CampaignBundleId;
  readonly windows: readonly CampaignSeedWindow[];
  readonly includeVerification: boolean;
};

export type CampaignPlanResult<TPlan extends readonly CampaignStageTemplate[] = readonly CampaignStageTemplate[]> = {
  readonly phases: readonly CampaignPhase[];
  readonly plan: TPlan;
  readonly sessionId: CampaignSessionId;
};

export type RecursiveTuple<T, Depth extends number, Acc extends readonly T[] = readonly []> =
  Acc['length'] extends Depth
    ? Acc
    : RecursiveTuple<T, Depth, readonly [...Acc, T]>;

export type CampaignTuple<T> = RecursiveTuple<T, 24>;

export type CampaignOutputShape<TCatalog extends readonly CampaignPlugin[]> = {
  [K in PluginCatalogKind<TCatalog>]: PluginOutputOf<TCatalog, K>;
};

export type CampaignRouteTemplate<T extends string = string> = `${T}` | `${T}/${string}`;

const severityRank: Readonly<Record<SeverityBand, number>> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const createCampaignId = (tenantId: TenantId, value: string): CampaignId =>
  withBrand(`${tenantId}::campaign::${value}`, 'CampaignId');

export const createCampaignSessionId = (tenantId: TenantId, campaignId: CampaignId): CampaignSessionId =>
  withBrand(`${tenantId}::session::${campaignId}`, 'CampaignSessionId');

export const createCampaignBundleId = (tenantId: TenantId, value: string): CampaignBundleId =>
  withBrand(`${tenantId}::bundle::${value}`, 'CampaignBundleId');

export const createCampaignPluginId = (value: string): CampaignPluginId => withBrand(`campaign-plugin-${value}`, 'CampaignPluginId');

export const createCampaignRoute = <TPath extends string>(prefix: string, route: CampaignRoute<TPath>): string =>
  `${prefix}::${route.join('/')}`;

const campaignIdToToken = (tenantId: TenantId): string => String(tenantId).replaceAll(':', '.');

export const buildCampaignRouteToken = <TLabel extends string>(tenantId: TenantId, label: TLabel): CampaignRouteToken<TLabel> =>
  `${campaignIdToToken(tenantId)}.${label}` as CampaignRouteToken<TLabel>;

export const clampCampaignIntensity = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return normalizeLimit(value);
};

export const normalizeCampaignSignals = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  return [...signals].sort((left, right) => severityRank[right.severity] - severityRank[left.severity]);
};

export const buildCampaignTrace = (tenantId: TenantId, campaignId: CampaignId): CampaignTraceEvent => {
  return {
    timestamp: new Date().toISOString(),
    route: ['discovery', 'modeling', 'orchestration'],
    phase: 'seed',
    tenantId,
  } as CampaignTraceEvent;
};

export const brandBundleSteps = (tenantId: TenantId, steps: readonly string[]): readonly CampaignBundleId[] =>
  steps.map((step, index) => createCampaignBundleId(tenantId, `${index}-${step}`));

export const buildSeedFromSignals = (
  tenantId: TenantId,
  campaignId: CampaignId,
  signals: readonly RecoverySignal[],
): CampaignSeed => {
  const normalizedSignals = normalizeCampaignSignals(signals);
  const fallback: RecoverySignal = {
    id: createSignalId('seed-default'),
    class: 'availability',
    severity: 'low',
    title: 'Fallback seed signal',
    createdAt: new Date().toISOString(),
    metadata: { kind: 'fallback' },
  };

  const sourceSignals = normalizedSignals.length > 0 ? normalizedSignals : [fallback];

  return {
    tenantId,
    campaignId,
    title: `Seed-${String(campaignId).slice(0, 18)}`,
    bundleId: createCampaignBundleId(tenantId, `seed-${String(campaignId)}`),
    windows: sourceSignals.map((signal, index) => ({
      index,
      durationMinutes: 10 + index,
      intensity: clampCampaignIntensity(signal.title.length / 10),
    })),
    route: ['discovery', 'modeling', 'orchestration'],
    labels: ['seeded', ...sourceSignals.map((signal) => `signal:${signal.class}`)],
    requiredSignals: sourceSignals.map((signal) => signal.id),
    expectedDurationMinutes: sourceSignals.reduce((total, signal) => total + signal.title.length, 0),
  };
};

export const buildPlanSeed = (tenantId: TenantId, attempt: StageAttempt): CampaignSeed => {
  const campaignSeedId = createCampaignId(tenantId, `${tenantId}-${attempt.id}`);
  const normalizedScore = String(attempt.normalizedScore).replace('.', '-');

  return {
    tenantId,
    campaignId: campaignSeedId,
    title: `seed-${attempt.phaseClass}`,
    bundleId: createCampaignBundleId(tenantId, `${attempt.phaseClass}-${normalizedScore}`),
    windows: [
      {
        index: 0,
        durationMinutes: clampCampaignIntensity(attempt.normalizedScore * 24) + 4,
        intensity: clampCampaignIntensity(attempt.normalizedScore),
      },
      {
        index: 1,
        durationMinutes: clampCampaignIntensity(attempt.normalizedScore * 18) + 12,
        intensity: clampCampaignIntensity(attempt.normalizedScore / 2),
      },
    ],
    route: ['discovery', 'modeling', 'orchestration'],
    labels: ['attempt', attempt.phaseClass],
    requiredSignals: [attempt.source, createSignalId(String(attempt.id))],
  };
};

export const campaignRouteTokens = (seed: CampaignSeed): readonly CampaignRouteToken[] => {
  return seed.route.map((segment) => `discovery.${segment}.seed` as CampaignRouteToken);
};

export const seedRouteDigest = (seed: CampaignSeed): string => {
  return `${seed.campaignId}::${seed.labels.join('|')}`;
};

export const seedToTuple = <TSeed extends CampaignSeed>(seed: TSeed): [CampaignId, CampaignSessionId] => [
  seed.campaignId,
  createCampaignSessionId(seed.tenantId, seed.campaignId),
];

export const campaignSeedSignature = (seed: CampaignSeed): string => `${seed.tenantId}::${seed.campaignId}::${seed.route.join('/')}`;

export const createCampaignSessionRef = (tenantId: TenantId, campaignId: CampaignId): CampaignSessionId =>
  createCampaignSessionId(tenantId, campaignId);
