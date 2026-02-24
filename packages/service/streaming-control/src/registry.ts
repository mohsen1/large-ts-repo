import { NoInfer, RecursivePath } from '@shared/type-level';
import type { StreamingControlRequest } from './control';

export type ModeSelector<T extends string> = `mode-${T}`;
export type ControlPolicyMode = 'adaptive' | 'conservative' | 'strict';
export type ScopedPolicyMode = ModeSelector<ControlPolicyMode>;

export interface PolicyScope {
  readonly tenant: string;
  readonly streamId: string;
  readonly requestedAt: string;
}

export interface ControlPolicyDescriptor<
  TMode extends ScopedPolicyMode = ScopedPolicyMode,
  TLabel extends string = string,
> {
  readonly mode: TMode;
  readonly label: TLabel;
  readonly priority: number;
  readonly tags: readonly string[];
}

export interface PolicyRegistryEntry<
  TMode extends ControlPolicyMode = ControlPolicyMode,
  TRequest extends StreamingControlRequest = StreamingControlRequest,
> {
  readonly key: `policy:${TMode}`;
  readonly mode: TMode;
  readonly label: string;
  readonly request: TRequest;
  readonly active: boolean;
}

export type PolicyByMode<T extends readonly PolicyRegistryEntry[]> = {
  [P in T[number] as P['key']]: Extract<T[number], { key: P['key'] }>;
};

export const buildPolicyScope = (request: NoInfer<StreamingControlRequest>): PolicyScope => ({
  tenant: request.tenant,
  streamId: request.streamId,
  requestedAt: new Date().toISOString(),
});

export const policyKey = (mode: ControlPolicyMode): `policy:${ControlPolicyMode}` => `policy:${mode}`;

export const normalizeTagPath = <T extends string>(...tags: readonly T[]) => {
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return normalized as unknown as readonly T[];
};

export const resolvePolicyTemplate = <T extends string>(scope: PolicyScope, ...tags: T[]) => {
  const flattened = [scope.tenant, scope.streamId, ...tags].join('.');
  const path = flattened.split('.').filter(Boolean).join('.');
  return `policy.${path}` as const;
};

export const flattenPolicyPath = <T extends readonly string[]>(
  paths: T,
): readonly [...T] => {
  return paths;
};

export const makePolicyRegistry = (
  mode: ControlPolicyMode,
  request: StreamingControlRequest,
): readonly PolicyRegistryEntry[] => [
  {
    key: `policy:${mode}`,
    mode,
    label: `registry:${request.streamId}`,
    request,
    active: true,
  },
];
