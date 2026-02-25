import { createIteratorChain } from '@shared/fault-intel-runtime';
import {
  asCampaignId,
  type CampaignId,
  type CampaignTemplateOptions,
  type CampaignTemplateRequest,
  type IncidentSignal,
  type PhaseType,
  type TenantId,
  type WorkspaceId,
} from '@domain/fault-intel-orchestration';
import type { NoInfer } from '@shared/fault-intel-runtime';

export type WorkflowId = `${string}:${string}:${number}`;
export type WorkflowTag = `tag:${string}`;

export type VariadicTuple<T> = readonly [T, ...T[]];
export type InferredTuple<T extends readonly unknown[]> = readonly [...T];

export type TemplatePhaseTuple<TPhases extends readonly PhaseType[]> = TPhases extends readonly []
  ? readonly []
  : readonly [...TPhases];

export type ReplaceKeyNames<TRecord extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof TRecord as K extends string ? `${Prefix}:${K}` : never]: TRecord[K];
};

export type SeveritySignalMap<TSignals extends readonly IncidentSignal[]> = {
  [K in TSignals[number]['severity']]: readonly Extract<TSignals[number], { severity: K }>[];
};

export type SignalWeight<TSeverity extends IncidentSignal['severity']> =
  TSeverity extends 'critical' ? 4 : TSeverity extends 'warning' ? 3 : TSeverity extends 'advisory' ? 2 : 1;

export type PhaseMap<TBlueprint extends { readonly phases: readonly PhaseType[] }> = {
  [K in TBlueprint['phases'][number]]: readonly [number, number];
} & Record<PhaseType, readonly [number, number]>;

export type CampaignRouteTuple<TPhases extends readonly PhaseType[]> = TPhases extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[]
]
  ? `${Head}:${Rest[number]}` | `${Head}`
  : never;

export type BrandedCampaign<T extends string> = `${T}::workflow`;

export interface CampaignSignalEnvelope<TPhase extends PhaseType = PhaseType> {
  readonly phase: TPhase;
  readonly signalId: string;
  readonly transport: string;
  readonly severity: IncidentSignal['severity'];
  readonly score: SignalWeight<IncidentSignal['severity']>;
}

export interface WorkflowPlan<
  TPhases extends readonly PhaseType[],
  TSignals extends readonly IncidentSignal[] = readonly IncidentSignal[],
> {
  readonly workflowId: WorkflowId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly route: TPhases;
  readonly phases: TemplatePhaseTuple<TPhases>;
  readonly signalBuckets: SeveritySignalMap<TSignals>;
  readonly tags: ReadonlySet<WorkflowTag>;
  readonly options: CampaignTemplateOptions;
  readonly signature: BrandedCampaign<`${TPhases[number]}-${TSignals['length']}`>;
}

export interface WorkflowExecutionContext<TPhases extends readonly PhaseType[]> {
  readonly planId: string;
  readonly phases: TPhases;
  readonly activeTags: ReadonlySet<string>;
  readonly startedAt: string;
  readonly campaignId: CampaignId;
}

export interface WorkflowDiagnostics {
  readonly workflowId: WorkflowId;
  readonly signalCount: number;
  readonly uniqueSignals: number;
  readonly riskWindow: number;
  readonly topTransport: string;
  readonly elapsedMs: number;
}

const defaultPhases = ['intake', 'triage', 'remediation', 'recovery'] as const satisfies readonly PhaseType[];

export const seededTemplate = {
  phases: defaultPhases,
  options: {
    enforcePolicy: true,
    maxSignals: 256,
    includeAllSignals: true,
  } as CampaignTemplateOptions,
};

const routeSignature = (route: readonly string[]): string => route.join('>');
const asTuple = <T extends readonly unknown[]>(values: T): InferredTuple<T> => [...values] as InferredTuple<T>;

const countBySeverity = (signals: readonly IncidentSignal[]) =>
  createIteratorChain(signals).toArray().reduce<
    Record<IncidentSignal['severity'], readonly IncidentSignal[]>
  >(
    (acc, signal) => {
      acc[signal.severity] = [...acc[signal.severity], signal];
      return acc;
    },
    {
      notice: [],
      advisory: [],
      warning: [],
      critical: [],
    },
  );

export const buildWorkflowPlan = <
  TPhases extends readonly PhaseType[],
  TSignals extends readonly IncidentSignal[] = readonly IncidentSignal[],
>(
  request: CampaignTemplateRequest<TPhases>,
  signals: NoInfer<TSignals>,
  options: NoInfer<CampaignTemplateOptions>,
): WorkflowPlan<TPhases, TSignals> => {
  const phases = asTuple(request.phases);
  const buckets = countBySeverity(signals);
  const signature = `${routeSignature(phases)}-${signals.length}` as BrandedCampaign<`${TPhases[number]}-${TSignals['length']}`>;
  const workflowId = `${request.tenantId}:${request.workspaceId}:${phases.length}` as WorkflowId;

  return {
    workflowId,
    tenantId: request.tenantId,
    workspaceId: request.workspaceId,
    route: phases as TPhases,
    phases: asTuple(request.phases) as TemplatePhaseTuple<TPhases>,
    signalBuckets: {
      notice: buckets.notice,
      advisory: buckets.advisory,
      warning: buckets.warning,
      critical: buckets.critical,
    } as unknown as SeveritySignalMap<TSignals>,
    tags: new Set<WorkflowTag>(['tag:seed', `tag:${workflowId}`] as const),
    options,
    signature,
  };
};

export const createExecutionContext = <
  TPhases extends readonly PhaseType[],
>(
  tenantId: TenantId,
  workspaceId: WorkspaceId,
  request: CampaignTemplateRequest<TPhases>,
): WorkflowExecutionContext<TPhases> => ({
  planId: `${tenantId}:${workspaceId}:${request.campaignSeed}`,
  phases: request.phases,
  activeTags: new Set(['execution', tenantId, workspaceId]),
  startedAt: new Date().toISOString(),
  campaignId: asCampaignId(`${tenantId}:${workspaceId}:${request.campaignSeed}` as never),
});

export const buildWorkflowDiagnostics = (
  workflow: WorkflowPlan<readonly PhaseType[], readonly IncidentSignal[]>,
  run: { readonly executedAt: string; readonly signals: readonly IncidentSignal[]; readonly riskScore: number },
): WorkflowDiagnostics => {
  const started = new Date(run.executedAt);
  const transportLoad = createIteratorChain(run.signals)
    .toArray()
    .reduce<Record<IncidentSignal['transport'], number>>(
      (acc, signal) => {
        acc[signal.transport] = (acc[signal.transport] ?? 0) + 1;
        return acc;
      },
      {
        mesh: 0,
        fabric: 0,
        cockpit: 0,
        orchestration: 0,
        console: 0,
      },
    );
  const topTransport = (Object.entries(transportLoad) as [IncidentSignal['transport'], number][])
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'mesh';

  const envelopes = createIteratorChain(run.signals)
    .map((signal) => signal.signalId)
    .toArray();

  return {
    workflowId: workflow.workflowId,
    signalCount: run.signals.length,
    uniqueSignals: new Set(envelopes).size,
    riskWindow: run.riskScore,
    topTransport,
    elapsedMs: Math.max(0, Date.now() - started.getTime()),
  };
};

const deriveEnvelope = (phase: PhaseType, signal: IncidentSignal): CampaignSignalEnvelope<PhaseType> => ({
  phase,
  signalId: signal.signalId,
  transport: signal.transport,
  severity: signal.severity,
  score: signal.metrics.length * (signal.severity === 'critical' ? 3 : 1) as SignalWeight<IncidentSignal['severity']>,
});

export const buildSignalsEnvelope = (phase: PhaseType, signals: readonly IncidentSignal[]): readonly CampaignSignalEnvelope<PhaseType>[] =>
  createIteratorChain(signals).map((signal) => deriveEnvelope(phase, signal)).toArray();

export const createPhaseMap = <TPhases extends readonly PhaseType[]>(phases: TPhases): PhaseMap<{ readonly phases: TPhases }> => {
  const map = {} as PhaseMap<{ readonly phases: TPhases }>;
  let position = 0;
  for (const phase of phases) {
    map[phase] = [position, position + 1] as const;
    position += 1;
  }
  return map;
};
