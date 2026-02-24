import type { Brand } from '@shared/type-level';

export type Hex = `#${string}`;

export type StageName = 'detect' | 'disrupt' | 'verify' | 'restore';
export type PluginStage = StageName;
export type PluginName = Brand<string, 'PluginName'>;
export type TenantId = Brand<string, 'TenantId'>;
export type PlanToken = Brand<string, 'PlanToken'>;
export type RunToken = Brand<string, 'RunToken'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type ScenarioWorkspace = Brand<string, 'ScenarioWorkspace'>;

export interface IdParts {
  tenant: TenantId;
  workspace: ScenarioWorkspace;
  scenario: ScenarioId;
}

export interface ScenarioIdCodec {
  encode(parts: IdParts): ScenarioId;
  decode(value: ScenarioId): IdParts;
}

const delimiter = '::' as const;

export const makeScenarioCodec = (): ScenarioIdCodec => ({
  encode(parts) {
    return `${parts.tenant}${delimiter}${parts.workspace}${delimiter}${parts.scenario}` as ScenarioId;
  },
  decode(value) {
    const [tenant, workspace, scenario] = value.split(delimiter);
    return {
      tenant: tenant as TenantId,
      workspace: (workspace || 'default') as ScenarioWorkspace,
      scenario: (scenario || 'default') as ScenarioId,
    };
  },
});

export interface StageWindow {
  readonly from: number;
  readonly to: number;
  readonly score: number;
}

export const defaultStagePriority: Record<StageName, number> = {
  detect: 0,
  disrupt: 1,
  verify: 2,
  restore: 3,
};

export const normalizeRunId = (tenant: string, scenario: string, token: string): RunToken => {
  const safeTenant = tenant.replace(/[^a-z0-9-]/gi, '-');
  const safeScenario = scenario.replace(/[^a-z0-9-]/gi, '-');
  return `${safeTenant}_${safeScenario}_${token}` as RunToken;
};

export type NestedReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly [infer Head, ...infer Tail]
    ? readonly [NestedReadonly<Head>, ...NestedReadonly<Tail>[]]
    : T extends readonly (infer U)[]
      ? ReadonlyArray<NestedReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: NestedReadonly<T[K]> }
        : T;

export type TemplatePaths<T> = T extends readonly [infer A, ...infer B]
  ? `${Extract<A, string>}` | `${Extract<A, string>}.${TemplatePaths<B>}`
  : T extends object
    ? { [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? `${K}` | `${K}.${TemplatePaths<T[K]>}`
        : K }[keyof T & string]
    : never;

export type RecursiveTuple<T extends readonly unknown[]> =
  T extends readonly [infer H, ...infer R]
    ? readonly [H, ...RecursiveTuple<R>]
    : readonly [];

export const defaultRunToken = `run:${Date.now()}` as RunToken;
