import {
  PluginInvocation,
  PluginInvocationShape,
  PluginKindOf,
  PluginResult,
  StageEvent,
  StageSignal,
  StressLabPluginId,
  StressPhase,
  TenantId,
  StageEventName,
  phaseOrder,
  pluginClassifiers,
  createPluginId,
  createSignalId,
  createWindowId,
  createTenantId,
  normalizePhaseLimit,
  normalizeWeight,
} from './models';

export type PluginKind = PluginKindOf<PluginInvocation<any, any, any, any>>;

export interface PipelineDefinitionStep {
  readonly id: StressLabPluginId;
  readonly phase: StressPhase;
  readonly kind: PluginKind;
  readonly tags: readonly string[];
}

export type StageMetric<TName extends string> = `metric:${TName}`;

export type PluginResultEnvelope<TOutput> = {
  readonly pluginId: StressLabPluginId;
  readonly ok: boolean;
  readonly output: TOutput;
  readonly event: StageEvent;
};

export type PluginInvocationMap = {
  readonly ingest: PluginInvocation<
    { readonly tenantId: TenantId; readonly signalIds: readonly string[] },
    { readonly accepted: boolean; readonly count: number; readonly stages: readonly StressPhase[] },
    { readonly tenantId: TenantId; readonly stageHistory: readonly StressPhase[]; readonly route: 'ingest'; readonly tags: readonly string[] },
    'stress-lab/ingest'
  >;
  readonly enrich: PluginInvocation<
    { readonly tenantId: TenantId; readonly inputSignals: readonly string[] },
    { readonly enriched: readonly StageSignal[]; readonly windowId: ReturnType<typeof createWindowId> },
    { readonly tenantId: TenantId; readonly stageHistory: readonly StressPhase[]; readonly route: 'enrich'; readonly tags: readonly string[] },
    'stress-lab/enrich'
  >;
  readonly diagnose: PluginInvocation<
    { readonly signals: readonly StageSignal[] },
    { readonly candidate: ReturnType<typeof createSignalId>; readonly riskScore: number },
    { readonly tenantId: TenantId; readonly stageHistory: readonly StressPhase[]; readonly route: 'diagnose'; readonly tags: readonly string[] },
    'stress-lab/diagnose'
  >;
  readonly simulate: PluginInvocation<
    { readonly signalId: ReturnType<typeof createSignalId>; readonly tenantId: TenantId },
    { readonly forecast: readonly number[]; readonly window: ReturnType<typeof createWindowId> },
    { readonly tenantId: TenantId; readonly stageHistory: readonly StressPhase[]; readonly route: 'simulate'; readonly tags: readonly string[] },
    'stress-lab/simulate'
  >;
  readonly score: PluginInvocation<
    { readonly tenantId: TenantId; readonly metrics: Readonly<Record<string, number>> },
    { readonly score: number; readonly stageAttempts: readonly StageAttemptSummary[] },
    { readonly tenantId: TenantId; readonly stageHistory: readonly StressPhase[]; readonly route: 'score'; readonly tags: readonly string[] },
    'stress-lab/score'
  >;
  readonly recommend: PluginInvocation<
    { readonly tenantId: TenantId; readonly score: number },
    { readonly recommendation: string; readonly priority: 'low' | 'medium' | 'high' | 'critical' },
    { readonly tenantId: TenantId; readonly stageHistory: readonly StressPhase[]; readonly route: 'recommend'; readonly tags: readonly string[] },
    'stress-lab/recommend'
  >;
};

export type StageAttemptSummary = {
  readonly tenantId: TenantId;
  readonly signal: StageSignal['signal'];
  readonly phaseWeight: number;
};

export type PluginInvocationCatalog = PluginInvocationShape<
  readonly [
    PluginInvocationMap['ingest'],
    PluginInvocationMap['enrich'],
    PluginInvocationMap['diagnose'],
    PluginInvocationMap['simulate'],
    PluginInvocationMap['score'],
    PluginInvocationMap['recommend'],
  ]
>;

export type PluginCatalog = PluginInvocationMap[keyof PluginInvocationMap];
export type PipelineShape = readonly PluginCatalog[];

export type RouteKind = (typeof phaseOrder)[number];

export type StageEventByIndex<T extends number> = `stage${T}:${string}:${string}`;

export interface CanonicalizedPluginTemplate {
  readonly id: StressLabPluginId;
  readonly tenantId: TenantId;
  readonly phase: RouteKind;
  readonly classes: (typeof pluginClassifiers)[keyof typeof pluginClassifiers];
}

export type PluginTemplateByKey<TMap extends Record<string, CanonicalizedPluginTemplate>> = {
  [K in keyof TMap]: K extends string
    ? {
        readonly [P in keyof TMap[K] as `${K}:${P & string}`]: TMap[K][P];
      }
    : never;
}[keyof TMap];

export const buildIngestTemplate = (tenantId: TenantId): CanonicalizedPluginTemplate => ({
  id: createPluginId('plugin-ingest-template'),
  tenantId,
  phase: phaseOrder[0],
  classes: pluginClassifiers.raw,
});

export const buildStageWeight = (phase: RouteKind, candidate: number, tenantId: TenantId): number => {
  const multiplier = candidate <= 0 ? 1 : normalizePhaseLimit(candidate);
  const phaseWeight = normalizeWeight(multiplier, 'medium');
  return Object.is(Number.EPSILON, phaseWeight)
    ? multiplier * 0
    : phaseWeight * multiplier * (String(tenantId).length > 1 ? 1.1 : 0.9);
};

export const inferPhaseFromEvent = (eventName: StageEvent): RouteKind | null => {
  const parts = eventName.split(':');
  const known = new Set<RouteKind>(phaseOrder);
  if (parts.length > 2) {
    const candidate = parts[2];
    return typeof candidate === 'string' && known.has(candidate as RouteKind)
      ? (candidate as RouteKind)
      : null;
  }
  return null;
};

export const deriveEventTags = (
  kind: RouteKind,
): readonly StageEventByIndex<number>[] => [
  `stage1:${kind}:ingest`,
  `stage2:${kind}:simulate`,
  `stage3:${kind}:score`,
] as const;

export const runbookStageDefinitions = (
  stageDefinitions: readonly PluginCatalog[],
): readonly PluginInvocation<any, any, any, any>[] =>
  stageDefinitions
    .toSorted((left, right) => left.kind.localeCompare(right.kind))
    .map((entry, index) => ({
      ...entry,
      kind: `${entry.kind}-runtime-${index}` as PluginKind,
    }));

export const resolvePluginDefinitions = (): PipelineShape => {
  const catalogEntry: PluginInvocationMap['ingest'] = {
    id: createPluginId('stress-lab/ingest/plugin'),
    tenantId: createTenantId('catalog'),
    kind: 'stress-lab/ingest',
    phase: 'observe',
    runbook: ['observe'],
    input: { tenantId: createTenantId('catalog'), signalIds: [] },
    context: { tenantId: createTenantId('catalog'), stageHistory: [], route: 'ingest', tags: [] },
    run: async (
      _input: {
        readonly tenantId: TenantId;
        readonly signalIds: readonly string[];
      },
      _context: {
        readonly tenantId: TenantId;
        readonly stageHistory: readonly StressPhase[];
        readonly route: 'ingest';
        readonly tags: readonly string[];
      },
    ): Promise<PluginResult<{
      readonly accepted: boolean;
      readonly count: number;
      readonly stages: readonly StressPhase[];
    }>> => ({
      ok: true,
      value: {
        accepted: true,
        count: 0,
        stages: ['ingest'],
      },
      generatedAt: new Date().toISOString(),
    }),
  };

  return [catalogEntry];
};
