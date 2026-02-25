import type {
  CampaignBlueprint,
  CampaignId,
  CampaignPhase,
  CampaignRoute,
  EventTemplate,
  IncidentSignal,
  NoInfer,
  PhaseType,
  CampaignTemplateRequest,
  CampaignTemplateOptions,
  RouteFromTuple,
} from './models';
import { createIteratorChain } from '@shared/fault-intel-runtime/src/iterator';

type SignalTuple<T extends readonly IncidentSignal[]> = T extends readonly [infer Head, ...infer Rest]
  ? Rest extends readonly IncidentSignal[]
    ? readonly [Head & IncidentSignal, ...SignalTuple<Rest>]
    : readonly [Head & IncidentSignal]
  : readonly [];

export interface CampaignPlan<TPhases extends readonly PhaseType[], TSignals extends readonly IncidentSignal[]> {
  readonly blueprint: CampaignBlueprint<TPhases>;
  readonly activeRoute: CampaignRoute<CampaignBlueprint<TPhases>>;
  readonly orderedSignals: SignalTuple<TSignals>;
  readonly tags: ReadonlySet<string>;
  readonly options: CampaignTemplateOptions;
}

export type FlattenedSignals<T extends readonly IncidentSignal[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head & IncidentSignal, ...FlattenedSignals<Tail & readonly IncidentSignal[]>]
  : readonly [];

export const routeByPhases = <TPhases extends readonly PhaseType[]>(phases: TPhases): RouteFromTuple<TPhases> =>
  phases.join('.') as RouteFromTuple<TPhases>;

export const normalizeSignalSeverity = (signal: IncidentSignal): IncidentSignal => {
  const normalized = signal.severity === 'critical' || signal.severity === 'warning' || signal.severity === 'advisory' || signal.severity === 'notice'
    ? signal.severity
    : 'notice';
  return {
    ...signal,
    severity: normalized,
  };
};

const resolvePlanRoute = <TPhases extends readonly PhaseType[]>(phases: TPhases): CampaignRoute<CampaignBlueprint<TPhases>> =>
  `campaign/${routeByPhases(phases)}` as CampaignRoute<CampaignBlueprint<TPhases>>;

export const createCampaignPlan = <
  TPhases extends readonly PhaseType[],
  TSignals extends readonly IncidentSignal[]
>(
  request: CampaignTemplateRequest<TPhases>,
  signals: TSignals,
  options: NoInfer<CampaignTemplateOptions> = {},
): CampaignPlan<TPhases, TSignals> => {
  const normalized = createIteratorChain(signals).map(normalizeSignalSeverity).toArray();
  const sorted = createIteratorChain(normalized).toArray().sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const phases = request.phases.map((phase): CampaignPhase<typeof phase> => ({
    phase,
    startedAt: new Date().toISOString(),
    operators: [],
    notes: [`auto-planned ${phase}`],
  }));
  void phases;

  return {
    blueprint: {
      campaignId: `${request.tenantId}::${request.workspaceId}::${request.campaignSeed}` as CampaignId,
      tenantId: request.tenantId,
      workspaceId: request.workspaceId,
      name: `${request.owner}'s campaign`,
      status: 'created',
      phases: request.phases,
      owners: [],
      objectives: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    activeRoute: resolvePlanRoute(request.phases),
    orderedSignals: sorted as unknown as SignalTuple<TSignals>,
    tags: new Set(['planner', ...request.owner.split('_'), ...request.campaignSeed.split('_')]),
    options,
  };
};

export const expandSignalWindows = <T extends readonly IncidentSignal[]>(signals: T): Record<string, IncidentSignal[]> => {
  return signals.reduce<Record<string, IncidentSignal[]>>((buckets, signal, index) => {
    const windowKey = `${signal.transport}-${Math.floor(index / 5)}`;
    const existing = buckets[windowKey];
    if (existing) {
      existing.push(signal);
    } else {
      buckets[windowKey] = [signal];
    }
    return buckets;
  }, {});
};

export const expandSignalWindowTemplates = <T extends readonly IncidentSignal[]>(signals: T): EventTemplate<[
  'window',
  `${T['length']}`,
  'signals'
]>[] => {
  return Object.keys(expandSignalWindows(signals)).map((key) => `window/${key}/signals` as EventTemplate<[
    'window',
    `${T['length']}`,
    'signals'
  ]>);
};

export const buildPlanSignalSignature = <TSignals extends readonly IncidentSignal[]>(signals: TSignals): string => {
  const parts = createIteratorChain(signals)
    .map((signal) => signal.signalId)
    .toArray()
    .join('|');
  return `sig:${parts}`;
};
