import type {
  Brand,
  AsyncDisposable,
  Disposable,
  KeyPath,
  MergeDeep,
  PluginMetadata,
  ValueAtPath,
  NoInfer,
  RoutedEvent,
} from '@shared/recovery-quantum-runtime';

export type QuantumTenantId = Brand<string, 'quantum-tenant-id'>;
export type QuantumSignalId = Brand<string, 'quantum-signal-id'>;
export type QuantumPlanId = Brand<string, 'quantum-plan-id'>;
export type QuantumPolicyId = Brand<string, 'quantum-policy-id'>;

export type QuantumSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type QuantumStateKind = 'draft' | 'staged' | 'active' | 'retired';

export type QuantumEventKind =
  | 'signal.received'
  | 'policy.attached'
  | 'plan.planned'
  | 'plan.executed'
  | 'plan.reconciled';

export type QuantumEventName = RoutedEvent<'quantum', `${string}:${string}`, 'ingress'>;

export type TemplateLiteralSeverity<T extends string> = `${T}/${QuantumSeverity}`;

export type SignalPath = KeyPath<QuantumSignal>;

export interface QuantumSignal {
  readonly id: QuantumSignalId;
  readonly tenant: QuantumTenantId;
  readonly name: string;
  readonly severity: QuantumSeverity;
  readonly dimension: string;
  readonly score: number;
  readonly payload: Record<string, unknown>;
  readonly observedAt: string;
}

export interface QuantumPolicy {
  readonly id: QuantumPolicyId;
  readonly tenant: QuantumTenantId;
  readonly title: string;
  readonly weight: number;
  readonly scope: readonly QuantumScope[];
}

export interface QuantumScope {
  readonly name: string;
  readonly tags: readonly string[];
}

export interface QuantumStep {
  readonly id: Brand<string, 'quantum-step-id'>;
  readonly signalId: QuantumSignalId;
  readonly command: string;
  readonly expectedLatencyMs: number;
}

export interface QuantumPlan {
  readonly id: QuantumPlanId;
  readonly tenant: QuantumTenantId;
  readonly state: QuantumStateKind;
  readonly owner: string;
  readonly steps: readonly QuantumStep[];
  readonly labels: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QuantumEnvelope<TKind extends QuantumEventKind, TPayload> {
  readonly tenant: QuantumTenantId;
  readonly kind: TKind;
  readonly payload: TPayload;
  readonly timestamp: string;
}

export interface QuantumEvent<TExt extends QuantumEventKind = QuantumEventKind> {
  readonly event: QuantumEnvelope<TExt, unknown>;
}

export interface QuantumRunbook {
  readonly id: Brand<string, 'quantum-runbook-id'>;
  readonly tenant: QuantumTenantId;
  readonly name: string;
  readonly region: Brand<string, 'quantum-region-id'>;
  readonly signals: readonly QuantumSignal[];
  readonly policies: readonly QuantumPolicy[];
  readonly plans: readonly QuantumPlan[];
  readonly metadata: {
    readonly priority: `${'p'}-${number}`;
    readonly zone: string;
    readonly tags: readonly string[];
    readonly policyCount?: string;
  };
}

export type SeverityWeight = {
  readonly [S in QuantumSeverity]: number;
};

export type SignalIndex = Map<string, QuantumSignal>;

export type AnyTuple<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? readonly [H, ...R]
  : readonly T[];

export type RecursivelyBuildTuple<
  T,
  MaxDepth extends number,
  Prefix extends string = '',
  Acc extends readonly string[] = [],
> = Acc['length'] extends MaxDepth
  ? Acc
  : RecursivelyBuildTuple<
      T extends string ? T : never,
      MaxDepth,
      `${Prefix}${T extends string ? T : ''}.`,
      readonly [...Acc, `${Prefix}${T extends string ? T : ''}`]
    >;

export type PathToValue<T extends QuantumRunbook, TPath extends SignalPath> = ValueAtPath<T, TPath>;

export interface QuantumPlannerPluginState {
  readonly planId: QuantumPlanId;
  readonly state: QuantumStateKind;
}

export interface QuantumPluginRuntime {
  readonly pluginId: Brand<string, 'quantum-plugin-runtime-id'>;
  readonly payload: unknown;
}

export type RuntimeState<T extends object> = {
  readonly [K in keyof T & string as `${K}.state`]: T[K];
};

export type RuntimeStateLike<T extends object> = MergeDeep<T, RuntimeState<T>>;

export type EventConstraint = {
  readonly event: QuantumEventKind;
  readonly requiredKind: `quantum/${QuantumSeverity}`;
};

export type EventConstraintState<T extends readonly EventConstraint[]> = {
  readonly count: T['length'];
  readonly constraints: T;
};

export interface PluginHost<TState extends object = Record<string, never>> {
  readonly tenant: QuantumTenantId;
  readonly state: TState;
}

export interface RunbookContext {
  readonly tenant: QuantumTenantId;
  readonly runbook: QuantumRunbook;
  readonly policyMetadata: PluginMetadata<'policy'>;
  readonly requestId: Brand<string, 'quantum-request-id'>;
  readonly correlation: Brand<string, 'quantum-correlation-id'>;
}

export type PlannerStepPath = TemplateLiteralSeverity<'planner-step'>;

export type PluginRuntimeFactory = (
  input: NoInfer<PluginHost<Record<string, unknown>>>,
) => Promise<QuantumPluginRuntime> | QuantumPluginRuntime;
