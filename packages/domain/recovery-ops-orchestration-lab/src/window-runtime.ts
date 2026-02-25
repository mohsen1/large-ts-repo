import { collectSignalsForProfile } from './sla-profiles';
import { randomUUID } from 'node:crypto';
import type {
  OrchestrationLab,
  LabPlan,
  LabPlanId,
  OrchestrationPolicy,
  OrchestrationLabEnvelope,
} from './types';

export type WindowEvent = 'opened' | 'extended' | 'stalled' | 'resolved';
export type WindowEnvelope = `window:${string}`;
export type WindowRoute = `${WindowEvent}:${WindowEnvelope}`;
export type RuntimeSignal = 'signal' | 'warning' | 'critical';

export type SLAProfileShape = {
  readonly id: string;
  readonly policy: string;
  readonly window: WindowEnvelope;
  readonly shape: 'adaptive' | 'tight';
};

export interface RuntimeWindow<TInput extends object = object, TOutput extends object = object> {
  readonly id: WindowEnvelope;
  readonly label: string;
  readonly status: 'queued' | 'active' | 'deferred' | 'closed';
  readonly policy: OrchestrationPolicy;
  readonly planIds: readonly LabPlanId[];
  readonly openAt: string;
  readonly closeAt: string;
  readonly metadata: Record<string, unknown>;
  readonly trace: readonly RuntimeWindowEvent<TInput>[];
  readonly output?: TOutput;
}

export interface RuntimeWindowEvent<TInput extends object = object> {
  readonly id: WindowRoute;
  readonly at: string;
  readonly input: TInput;
  readonly tags: readonly string[];
  readonly score: number;
}

export interface WindowExecutionLog {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly score: number;
  readonly status: 'ok' | 'warn' | 'error';
  readonly note: string;
}

export interface WindowPolicyEnvelope {
  readonly policyId: OrchestrationPolicy['id'];
  readonly window: WindowEnvelope;
  readonly constraints: number;
}

export type Timeline<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...Timeline<Tail>]
  : readonly [];

const nowIso = (): string => new Date().toISOString();

type WindowRouteId = `route:${string}`;

const toWindowPath = (seed: string): WindowRouteId => `route:${seed}` as WindowRouteId;

const asPolicyId = (value: string): OrchestrationPolicy['id'] => value as OrchestrationPolicy['id'];
const asWindowName = (value: string): WindowEnvelope => `window:${value}` as WindowEnvelope;
const asPlanId = (value: string): LabPlanId => value as LabPlanId;
const asTierSignal = (tier: number): RuntimeSignal => (tier > 2 ? 'critical' : tier > 0 ? 'warning' : 'signal');

const buildPolicyId = (lab: OrchestrationLab, profileId: string): OrchestrationPolicy['id'] =>
  asPolicyId(`${profileId}:${lab.id}:${randomUUID()}`);

const selectPlanIds = (plans: readonly LabPlan[]) => [...new Set(plans.map((plan) => plan.id))] as readonly LabPlanId[];
const planDigest = (plans: readonly LabPlan[]): string =>
  plans
    .map((plan) => `${plan.id}:${plan.steps.length}`)
    .toSorted()
    .join('|');

const buildRuntimePolicy = <
  TLab extends OrchestrationLab,
  TSignal extends readonly string[],
>(
  lab: TLab,
  profileId: string,
  signals: TSignal,
): OrchestrationPolicy => {
  const criticalThreshold = signals.filter((signal) => signal.includes('critical')).length;
  return {
    id: buildPolicyId(lab, profileId),
    tenantId: lab.tenantId,
    maxParallelSteps: Math.max(1, lab.signals.length),
    minConfidence: Math.min(1, Math.max(0.1, (signals.length / Math.max(1, lab.signals.length)) / 2)),
    allowedTiers: criticalThreshold > 0 ? ['signal', 'warning', 'critical'] : ['signal', 'warning'],
    minWindowMinutes: 1 + criticalThreshold,
    timeoutMinutes: Math.max(15, lab.plans.length * 10 + criticalThreshold * 5),
  };
};

const fromPlanSignals = (plans: readonly LabPlan[]): readonly string[] =>
  plans.flatMap((plan) => plan.steps.map((step, index) => `${plan.id}:${step.id}:${index}`));

const normalizeLabel = (window: WindowEnvelope): string => window.replace(/^window:/, '').replace(/:/g, '/');

export const profileWindowFromProfile = (tenant: string, policy: string): SLAProfileShape => {
  const normalized = {
    id: `window-profile:${tenant}:${policy}`,
    policy,
    window: asWindowName(randomUUID()),
    shape: Math.random() > 0.5 ? 'adaptive' : 'tight',
  } as const;
  return normalized;
};

export const buildRuntimeWindow = <TInput extends object, TOutput extends object = object>(
  lab: OrchestrationLab,
  profileId: string,
  plans: readonly LabPlan[],
  route: readonly string[],
  profile?: { readonly policy: string; readonly signalCount: number },
): RuntimeWindow<TInput, TOutput> => {
  const signals = collectSignalsForProfile(plans);
  const inferredPolicy = buildRuntimePolicy(lab, profileId, signals);
  const routeLabel = [...route, inferredPolicy.id, randomUUID()].filter(Boolean).join('>');

  return {
    id: asWindowName(randomUUID()),
    label: `${normalizeLabel(asWindowName(routeLabel))}::${lab.id}`,
    status: 'queued',
    policy: inferredPolicy,
    planIds: selectPlanIds(plans),
    openAt: lab.createdAt,
    closeAt: lab.updatedAt,
    metadata: {
      tenant: lab.tenantId,
      site: lab.tenantId,
      route,
      signals,
      planDigest: planDigest(plans),
      profile: profile?.policy,
      signalCount: String(signals.length),
      routePath: toWindowPath(routeLabel),
    },
    trace: [
      {
        id: `opened:${asWindowName(routeLabel)}` as WindowRoute,
        at: nowIso(),
        input: {} as TInput,
        tags: ['window:create', String(lab.signals.length), asTierSignal(lab.signals.length)],
        score: 1,
      },
    ],
  };
};

export const startWindow = <TInput extends object, TOutput extends object = TInput>(
  window: RuntimeWindow<TInput, TOutput>,
): RuntimeWindow<TInput, TOutput> => ({
  ...window,
  status: 'active',
  trace: [...window.trace, { id: `opened:${window.id}` as WindowRoute, at: nowIso(), input: window.trace[0]?.input ?? ({} as TInput), tags: ['activate', String(window.trace.length)], score: 1 }],
});

export const stallWindow = <TInput extends object, TOutput extends object = TInput>(
  window: RuntimeWindow<TInput, TOutput>,
  note: string,
): RuntimeWindow<TInput, TOutput> => ({
  ...window,
  status: 'deferred',
  trace: [
    ...window.trace,
    {
      id: `stalled:${window.id}` as WindowRoute,
      at: nowIso(),
      input: window.trace[0]?.input ?? ({} as TInput),
      tags: ['stall', note],
      score: Math.max(0, window.trace.length - 1),
    },
  ],
});

export const resolveWindow = <TInput extends object, TOutput extends object>(
  window: RuntimeWindow<TInput, TOutput>,
  output: TOutput,
): RuntimeWindow<TInput, TOutput> => ({
  ...window,
  status: 'closed',
  output,
  trace: [
    ...window.trace,
    {
      id: `resolved:${window.id}` as WindowRoute,
      at: nowIso(),
      input: output as unknown as TInput,
      tags: ['resolve', 'done'],
      score: Math.min(1, window.trace.length / 5),
    },
  ],
});

export const summarizeWindowTrace = <TInput extends object, TOutput extends object>(window: RuntimeWindow<TInput, TOutput>): WindowExecutionLog => ({
  id: `trace:${window.id}`,
  startedAt: window.openAt,
  endedAt: window.closeAt,
  score: Number(window.trace.length.toFixed(2)),
  status: window.status === 'closed' ? 'ok' : 'warn',
  note: `${window.label} | plans=${window.planIds.length} | status=${window.status}`,
});

export const asTimeline = <TInput extends object>(
  window: RuntimeWindow<TInput>,
): Timeline<readonly RuntimeWindowEvent<TInput>[]> => {
  return [...window.trace] as unknown as Timeline<readonly RuntimeWindowEvent<TInput>[]>;
};

export const inferInput = <T>(value: T): T extends infer TInput
  ? { readonly [Key in keyof TInput]: TInput[Key] extends string | number | boolean | object ? TInput[Key] : never }
  : T => {
  return value as never;
};

export const planIdsFromWindow = <TInput extends object, TOutput extends object>(
  window: RuntimeWindow<TInput, TOutput>,
): readonly LabPlanId[] => [...new Set(window.planIds)];

export const extendWindow = <TInput extends object, TOutput extends object>(
  window: RuntimeWindow<TInput, TOutput>,
  extensionMinutes: number,
): RuntimeWindow<TInput, TOutput> => ({
  ...window,
  closeAt: new Date(Date.now() + Math.max(1, extensionMinutes) * 60_000).toISOString(),
  trace: [
    ...window.trace,
    {
      id: `extended:${window.id}` as WindowRoute,
      at: nowIso(),
      input: window.trace[0]?.input ?? ({} as TInput),
      tags: ['extend', String(extensionMinutes)],
      score: Math.max(0, Number((extensionMinutes / 60).toFixed(2))),
    },
  ],
});

export const buildWindowRuntime = async <TInput extends object, TOutput extends object = TInput>(
  envelope: OrchestrationLabEnvelope,
  profileId: string,
): Promise<RuntimeWindow<TInput, TOutput>> => {
  const window = buildRuntimeWindow<TInput, TOutput>(
    envelope.lab,
    profileId,
    envelope.plans,
    [String(envelope.id), envelope.state],
    { policy: 'batch', signalCount: envelope.plans.length },
  );
  return startWindow(window);
};

export const isTerminalWindow = <TInput extends object, TOutput extends object>(
  window: RuntimeWindow<TInput, TOutput>,
): window is RuntimeWindow<TInput, TOutput> & { readonly output: TOutput } =>
  window.status === 'closed' && window.trace.some((entry) => entry.tags.includes('done'));
