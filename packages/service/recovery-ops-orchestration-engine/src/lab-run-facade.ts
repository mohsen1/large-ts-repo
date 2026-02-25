import { randomUUID } from 'node:crypto';
import {
  buildLabWorkspace,
  evaluateWindowHealth,
  type OrchestrationLab,
  type OrchestrationPolicy,
  type OrchestrationLabEnvelope,
  type SLAProfile,
  type SLAValidation,
  computeProfileDigest,
  normalizeProfile,
  withWindow,
  collectSignalsForProfile,
  type SLAConstraint,
} from '@domain/recovery-ops-orchestration-lab';
import { buildEngineSurface, type EngineSurface } from './orchestrated-lab';
import { RecoveryOpsOrchestrationLabStore } from '@data/recovery-ops-orchestration-lab-store';
import {
  createContractRuntime,
  createPortRuntime,
  type ContractDescriptor,
  executePortNetwork,
  type PortName,
} from '@shared/typed-orchestration-core';
import { ok, fail, type Result } from '@shared/result';
import { NoInfer } from '@shared/type-level';

export type LabEventName = `lab:${string}`;
export type RunEnvelope = `run:${string}`;
export type AuditTag = `tag:${string}`;

export interface RunFacadeContext {
  readonly tenant: string;
  readonly requestedBy: string;
  readonly profile: SLAProfile;
  readonly policy: OrchestrationPolicy;
  readonly tags: readonly AuditTag[];
}

export interface LabFacadeDraft {
  readonly planId?: string;
  readonly notes: readonly string[];
  readonly metadata: Record<string, string>;
}

export interface LabFacadeResult {
  readonly runId: string;
  readonly tenant: string;
  readonly planId: string;
  readonly validation: SLAValidation;
  readonly scores: readonly number[];
  readonly diagnostics: readonly string[];
  readonly surface: EngineSurface;
}

type TierBridge = {
  readonly signal: 'signal' | 'warning' | 'critical';
  readonly sla: SlaTierMarker;
};

type SlaTierMarker = 'bronze' | 'silver' | 'gold' | 'platinum';

type UnifiedFacadeInput = {
  readonly envelope?: OrchestrationLabEnvelope;
  readonly surface?: EngineSurface;
};

type UnifiedFacadeOutput = {
  readonly planIds: readonly string[];
  readonly source: 'runtime' | 'surface';
};

const nowIso = (): string => new Date().toISOString();
const createRunId = (value: string): RunEnvelope => `${value}:${randomUUID()}` as RunEnvelope;
const asTag = (value: string): AuditTag => `tag:${value}` as AuditTag;
const asContractName = (value: string): `contract:${string}` => `contract:${value}` as `contract:${string}`;
const asPortName = (value: string): PortName => `port:${value}` as PortName;
const asPolicyId = (value: string): OrchestrationPolicy['id'] => value as OrchestrationPolicy['id'];

const bridgeTier = (value: number): TierBridge => {
  if (value >= 3) {
    return { signal: 'critical', sla: 'platinum' };
  }
  if (value >= 2) {
    return { signal: 'warning', sla: 'gold' };
  }
  if (value >= 1) {
    return { signal: 'warning', sla: 'silver' };
  }
  return { signal: 'signal', sla: 'bronze' };
};

const constraintsFromProfile = (profile: SLAProfile): readonly SLAConstraint[] =>
  profile.constraints.filter((constraint) => constraint.enabled);

const summarizeNotes = (diagnostics: readonly string[]): string => diagnostics.join(' | ');

const buildAllowedTiers = (constraints: readonly SLAConstraint[]): readonly ('signal' | 'warning' | 'critical')[] => {
  const bridge = bridgeTier(constraints.length);
  const base: ('signal' | 'warning' | 'critical')[] = ['signal'];
  if (bridge.signal === 'warning' || bridge.signal === 'critical') {
    base.push('warning');
  }
  if (bridge.signal === 'critical') {
    base.push('critical');
  }
  return [...new Set(base)] as readonly ('signal' | 'warning' | 'critical')[];
};

const toFacadePolicy = (tenant: string, profile: SLAProfile, constraints: readonly SLAConstraint[]): OrchestrationPolicy => {
  return {
    id: asPolicyId(`policy:${tenant}:${profile.id}`),
    tenantId: tenant,
    maxParallelSteps: Math.max(1, constraints.length),
    minConfidence: Math.min(1, 0.1 * Math.max(1, constraints.length)),
    allowedTiers: buildAllowedTiers(constraints),
    minWindowMinutes: Math.max(1, profile.policy === 'batch' ? 5 : 2),
    timeoutMinutes: Math.max(15, 30 + constraints.length * 8),
  };
};

const toContractDescriptors = (
  profile: SLAProfile,
  policy: OrchestrationPolicy,
): readonly ContractDescriptor<object, object, object, object>[] => {
  const constraintNames = constraintsFromProfile(profile).map((entry) => entry.metric);
  return constraintNames.map(
    (name, index): ContractDescriptor<object, object, object, object> => ({
      name: asContractName(`profile:${profile.id}:${name}:${index}`),
      slot: `policy-${name}`,
      stage: index % 2 === 0 ? 'discover' : 'score',
      dependsOn: index > 0 ? [asContractName(`profile:${profile.id}:${constraintNames[index - 1]}:${index - 1}`)] : [],
      weight: Math.max(1, policy.maxParallelSteps),
      metadata: {
        tier: 'medium',
        owner: profile.tenantId,
      },
      run: async (event) => ({
        ok: true,
        output: {
          name: event.name,
          seedTenant: event.context.tenant,
          stage: event.context.stage,
          policyOwner: profile.tenantId,
          constraint: name,
          count: constraintsFromProfile(profile).length,
        },
        diagnostics: [`contract=${event.name}`, `stage=${event.context.stage}`, `policy=${policy.id}`],
        level: 'medium',
      }),
    }),
  );
};

const diagnosticWindow = (lab: OrchestrationLab, profile: SLAProfile): string[] => {
  const windows = [
    withWindow(new Date(), new Date(Date.now() + 30 * 60_000), 'bronze'),
    withWindow(new Date(), new Date(Date.now() + 90 * 60_000), 'silver'),
  ];

  return windows.map((window) => `${window.id}:${window.shape}:${lab.id}:${profile.id}`);
};

const policyDiagnostics = (policy: OrchestrationPolicy, planCount: number): readonly string[] => {
  const policyLine = `policy=${policy.id}`;
  const summary = `parallel=${policy.maxParallelSteps}`;
  const tolerance = `tiers=${policy.allowedTiers.join(',')}`;
  return [policyLine, summary, tolerance, `plans=${planCount}`].toSorted();
};

const computeRuntimeMap = <T>(values: ReadonlyMap<string, unknown>): ReadonlyMap<string, T> =>
  new Map(Array.from(values.entries()).map(([key, value]) => [key, value as T]));

export const runLabFacades = async (
  lab: OrchestrationLab,
  profileInput: SLAProfile,
  context: RunFacadeContext,
): Promise<Result<LabFacadeResult, Error>> => {
  try {
    const profile = normalizeProfile({
      tenantId: context.tenant,
      constraints: constraintsFromProfile(profileInput),
      policy: context.profile.policy,
      metadata: {
        ...context.profile.metadata,
        source: 'facade',
      },
    });

    const policy = toFacadePolicy(context.tenant, profile, constraintsFromProfile(profile));
    const store = new RecoveryOpsOrchestrationLabStore();
    const envelope = buildLabWorkspace({ lab, policy });
    const digest = computeProfileDigest(profile);
    const runId = createRunId(policy.id);

    const ports = [
      {
        name: asPortName(`policy-surface:${policy.id}`),
        phase: 'ingress' as const,
        protocol: 'stream' as const,
        descriptor: { id: runId, route: ['ingress', context.tenant] },
        metadata: { owner: context.requestedBy, team: 'ops', level: 'low', createdAt: nowIso() },
        transform: (input: UnifiedFacadeInput) => {
          const source = input.envelope;
          if (!source) {
            return { command: 0 };
          }
          return {
            policyId: policy.id,
            planCount: source.plans.length,
            planIds: source.plans.map((entry) => String(entry.id)),
            command: source.plans.length,
          };
        },
      },
      {
        name: asPortName(`validation-${policy.id}`),
        phase: 'audit' as const,
        protocol: 'rest' as const,
        descriptor: { id: runId, route: ['validate', context.tenant] },
        metadata: { owner: context.requestedBy, team: 'ops', level: 'low', createdAt: nowIso() },
        transform: (input: UnifiedFacadeInput) => {
          const surface = input.surface;
          return {
            policy: `${policy.id}`,
            mandatoryTags: [...new Set([...(surface?.commandSelection?.mandatoryTags ?? []), `run:${runId}`])],
          };
        },
      },
    ];

    const networkRuntime = createPortRuntime(
      {
        transport: 'stream',
        routes: [asPortName('run'), asPortName('validation'), asPortName('telemetry')],
      },
      ports as never,
    );

    const profileContract = createContractRuntime([
      {
        name: asContractName(`contract:${policy.id}:surface`),
        slot: 'orchestrate',
        stage: 'discover',
        dependsOn: [],
        weight: 1,
        metadata: { tier: 'high', owner: context.requestedBy },
        run: async () => {
          const validation = diagnosticWindow(lab, profile);
          return {
            ok: true,
            output: validation,
            diagnostics: [
              `policy=${policy.id}`,
              `digest=${digest.score}`,
              `diagnostic=${validation.length}`,
            ],
            level: 'critical',
          };
        },
      } as ContractDescriptor<object, string[], object, object>,
      ...toContractDescriptors(profile, policy),
    ] as const);

    const profileSurface = buildEngineSurface(lab);
    const summary = evaluateWindowHealth(profile, profile.id, [withWindow(new Date(), new Date(Date.now() + 120 * 60_000), 'bronze')]);

    const diagnostics = [
      ...diagnosticWindow(lab, profile),
      digest.id,
      ...summary.violations,
      ...policyDiagnostics(policy, lab.plans.length),
      summarizeNotes([runId, String(profile.id)]),
    ];

    const selectedPlan = envelope.selectedPlan ?? lab.plans[0];
    const selectedPlanId = String(selectedPlan?.id ?? lab.plans[0]?.id ?? `${lab.id}-fallback`);

    const contractResult = await profileContract.runAll({
      seed: {
        ...profile,
        ...policy,
      },
      metadata: { owner: context.requestedBy, tenant: context.tenant, source: 'facade' },
      stage: 'discover',
      routeLabel: `run:${runId}`,
    } as never);

    const contractOutputKeys = Object.keys(Object.fromEntries([...contractResult]));
    const portOutput = await executePortNetwork(
      {
        transport: 'stream',
        routes: [asPortName('run'), asPortName('validation'), asPortName('telemetry')],
      },
      ports as never,
      {
        envelope,
        surface: profileSurface,
      },
      {
        emitWarnings: true,
        traceLabel: runId,
      },
    );

    const upsert = store.upsertEnvelope({
      ...envelope.envelope,
      id: `envelope:${runId}` as OrchestrationLabEnvelope['id'],
      plans: envelope.envelope.plans,
      metadata: {
        ...envelope.envelope.metadata,
        runId,
        runProfile: profile.id,
      },
      revision: envelope.envelope.revision + 1,
    });

    if (!upsert.ok) {
      return fail(upsert.error);
    }

    await store.exportEncodedEnvelope(String(upsert.value.envelope.id));
    await store.exportSummary();

    const runtimeSurfaceMap = computeRuntimeMap<object>(portOutput.runtimeMap);

    return ok({
      runId,
      tenant: context.tenant,
      planId: selectedPlanId,
      validation: {
        ...summary,
        score: digest.score,
        profileId: profile.id,
      },
      scores: [
        summary.score,
        digest.score,
        profile.constraints.length,
        ...contractOutputKeys.map((key) => Number(key.length) / 10),
        ...Object.keys(Object.fromEntries(runtimeSurfaceMap)).map((key) => key.length),
      ],
      diagnostics: [
        runId,
        selectedPlanId,
        ...context.tags,
        ...policyDiagnostics(policy, lab.plans.length),
      ],
      surface: {
        ...profileSurface,
        commandSelection: {
          ...profileSurface.commandSelection,
          mandatoryTags: [
            ...new Set([
              ...profileSurface.commandSelection.mandatoryTags,
              ...contractOutputKeys,
              ...context.tags,
              ...runtimeSurfaceMap.keys(),
            ]),
          ],
        },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('run-facade-failed'));
  }
};

export const enrichDraft = (
  runId: RunEnvelope,
  lab: OrchestrationLab,
  plan?: { readonly id: string },
): LabFacadeDraft => {
  const noteSet = new Set<string>([
    `run=${runId}`,
    `lab=${lab.id}`,
    `tenant=${lab.tenantId}`,
    `plan=${plan?.id ?? 'none'}`,
    `created=${nowIso()}`,
  ]);

  return {
    planId: plan?.id,
    notes: [...noteSet],
    metadata: {
      planCount: String(lab.plans.length),
      signalCount: String(lab.signals.length),
    },
  };
};

export const executeDraft = async (
  context: RunFacadeContext,
  draft: NoInfer<LabFacadeDraft>,
  lab: OrchestrationLab,
): Promise<Result<{ readonly id: RunEnvelope; readonly context: RunFacadeContext & { readonly draft: LabFacadeDraft } }, Error>> => {
  const contracts = createContractRuntime([
    {
      name: asContractName(`contract:${context.tenant}:execute`),
      slot: 'execute',
      stage: 'execute',
      dependsOn: [],
      weight: 1,
      metadata: { tier: 'high', owner: context.requestedBy },
      run: async () => ({
        ok: true,
        output: `${lab.id}::${context.tenant}`,
        diagnostics: ['execute-draft', nowIso()],
        level: 'critical',
      }),
    } as ContractDescriptor<object, string, object, object>,
  ] as const);

  await contracts.runAll({
    seed: lab as unknown as object,
    metadata: {
      owner: context.requestedBy,
      tenant: context.tenant,
      level: 'high',
      createdAt: nowIso(),
    } as never,
    stage: 'execute',
    routeLabel: `execute:${draft.planId ?? 'default'}`,
  });

  return ok({
    id: `run:${draft.planId ?? lab.id}` as RunEnvelope,
    context: {
      ...context,
      tenant: context.tenant,
      draft,
    },
  });
};
