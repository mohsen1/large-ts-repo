import { type Brand, withBrand } from '@shared/core';
import { type NoInfer, type OmitNever } from '@shared/type-level';
import { asRouteId, type LatticeRouteId, type LatticeTenantId } from './ids';

export type BlueprintVersion = `${number}.${number}.${number}`;

export type BlueprintState =
  | 'draft'
  | 'validation'
  | 'approved'
  | 'deployed'
  | 'retired';

export type BlueprintStepKind = 'ingest' | 'transform' | 'observe' | 'emit' | 'validate';

export type BrandedBlueprintId<K extends string> = Brand<string, `blueprint:${K}:id`>;
export type BrandedBlueprintStepId<K extends string> = Brand<string, `blueprint-step:${K}:id`>;

export interface LatticeBlueprintStep<TKind extends BlueprintStepKind = BlueprintStepKind, TPayload extends string = string> {
  readonly kind: TKind;
  readonly id: BrandedBlueprintStepId<TPayload>;
  readonly target: TPayload;
  readonly payloadSchema: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly required: boolean;
}

export interface LatticeBlueprintManifest<
  TKind extends BlueprintStepKind = BlueprintStepKind,
  TPayload extends string = string,
> {
  readonly tenantId: LatticeTenantId;
  readonly blueprintId: BrandedBlueprintId<TPayload>;
  readonly name: string;
  readonly version: BlueprintVersion;
  readonly state: BlueprintState;
  readonly route: LatticeRouteId;
  readonly steps: readonly LatticeBlueprintStep<TKind, TPayload>[];
}

export type RouteFor<K extends BlueprintStepKind, T extends string> = `${K}::${T}`;

export type BlueprintPath<T extends readonly string[]> = T extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? R extends readonly []
    ? `${BlueprintStepKind & string}::${H}`
    : `${BlueprintStepKind & string}::${H}` | `${BlueprintStepKind & string}::${H}/${BlueprintPath<R>}`
  : never;

export type RecursiveStepList<T extends readonly string[]> = T extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? readonly [{ readonly id: H }, ...RecursiveStepList<R>]
  : readonly [];

export interface LatticeBlueprintConfig<TSteps extends readonly string[] = readonly string[]> {
  readonly tenantId: LatticeTenantId;
  readonly name: string;
  readonly version: BlueprintVersion;
  readonly state?: BlueprintState;
  readonly steps: NoInfer<TSteps>;
  readonly tags?: readonly string[];
}

export interface BlueprintPatch<TSteps extends readonly string[]> {
  readonly name?: string;
  readonly state?: BlueprintState;
  readonly tags?: readonly string[];
  readonly steps?: NoInfer<TSteps>;
}

export type BlueprintDescriptor = {
  readonly tenantId: string;
  readonly name: string;
  readonly version: BlueprintVersion;
  readonly route: string;
  readonly steps: readonly string[];
};

export type BlueprintTuple<TSteps extends readonly string[]> =
  TSteps extends readonly [
    infer H extends string,
    ...infer R extends readonly string[],
  ]
    ? readonly [BrandedBlueprintStepId<H>, ...BlueprintTuple<R>]
    : readonly [];

export type StepNames<TBlueprint extends LatticeBlueprintManifest> = TBlueprint['steps'][number]['kind'];

export type StepPayloadByKind<
  TBlueprint extends LatticeBlueprintManifest,
  TKind extends TBlueprint['steps'][number]['kind'],
> = TBlueprint['steps'][number] extends { kind: TKind; target: infer TTarget }
  ? TTarget & string
  : never;

export type NormalizeBlueprintState<T> = OmitNever<
  {
    [K in keyof T]: T[K] extends undefined | '' ? never : T[K];
  }
>;

const KNOWN_STEPS = ['ingest', 'transform', 'validate', 'observe', 'emit'] as const satisfies readonly BlueprintStepKind[];

const normalizeTenant = (tenantId: string): string => tenantId.trim().toLowerCase().replace(/\/+/, '/');

const resolveBlueprintStepKind = (step: string): BlueprintStepKind => {
  if (step === 'transform' || step === 'observe' || step === 'emit' || step === 'validate') {
    return step;
  }
  return 'ingest';
};

const seedBlueprints = [
  {
    tenantId: asRouteId('tenant:default'),
    name: 'recovery-lattice-ingestion',
    version: '0.1.0' as const,
    route: 'ingest::core' as const,
    steps: ['ingest', 'transform', 'validate', 'observe'],
  },
  {
    tenantId: asRouteId('tenant:primary'),
    name: 'edge-observability',
    version: '1.0.0' as const,
    route: 'observe::edges' as const,
    steps: ['observe', 'transform', 'emit'],
  },
] as const satisfies readonly BlueprintDescriptor[];

export const defaultBlueprintSeed: readonly BlueprintDescriptor[] = [...seedBlueprints].map((entry, index) => ({
  ...entry,
  priority: index + 1,
  generatedAt: new Date(Date.now() + index).toISOString(),
}));

const buildStepTarget = (tenantId: string, index: number, target: string): string =>
  `${tenantId}:${target}:${index}`;

export const buildBlueprintId = (tenantId: string, name: string): BrandedBlueprintId<string> => {
  const safeName = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return withBrand(`blueprint:${tenantId.toLowerCase()}:${safeName}`, `blueprint:${safeName}:id`);
};

export const buildStepId = (
  tenantId: string,
  kind: BlueprintStepKind,
  target: string,
): BrandedBlueprintStepId<string> => {
  const suffix = `${kind}:${target}`;
  return withBrand(`${tenantId}::${suffix}`, `blueprint-step:${suffix}:id`);
};

export const normalizeBlueprintRoute = (tenantId: string, step: string): LatticeRouteId => {
  const normalized = `${normalizeTenant(tenantId)}/${step}`.replace(/^\/+|\/+$/g, '');
  return asRouteId(`route:${normalized}`);
};

export const pathFromSteps = <TSteps extends readonly string[]>(
  tenantId: string,
  steps: NoInfer<TSteps>,
): BlueprintPath<TSteps> => {
  const normalized = steps
    .map((step) => step.trim().toLowerCase())
    .filter(Boolean)
    .join('/');
  return `${tenantId}/${normalized}` as BlueprintPath<TSteps>;
};

export const makeBlueprint = <
  const TSteps extends readonly string[],
>(
  tenantId: LatticeTenantId,
  config: LatticeBlueprintConfig<TSteps>,
  metadata: string,
): LatticeBlueprintManifest<BlueprintStepKind, string> => {
  const route = pathFromSteps(String(tenantId), config.steps);
  const steps = config.steps.map((step, index) => {
    const kind = resolveBlueprintStepKind(step);
    return {
      kind,
      id: buildStepId(String(tenantId), kind, buildStepTarget(String(tenantId), index, step)),
      target: step,
      payloadSchema: { type: 'object', metadata },
      tags: config.tags ?? [],
      required: index % 2 === 0,
    } satisfies LatticeBlueprintStep;
  });

  const tuple: BrandedBlueprintStepId<string>[] = [];
  for (const [index, step] of config.steps.entries()) {
    tuple.push(
      buildStepId(String(tenantId), resolveBlueprintStepKind(step), buildStepTarget(String(tenantId), index, step)),
    );
  }

  const manifest: LatticeBlueprintManifest<BlueprintStepKind, string> = {
    tenantId,
    blueprintId: buildBlueprintId(String(tenantId), config.name),
    name: config.name,
    version: config.version,
    state: config.state ?? 'draft',
    route: normalizeBlueprintRoute(String(tenantId), `${tuple.length}:${route}`),
    steps,
  };

  return manifest;
};

export const applyBlueprintPatch = <
  TBlueprint extends LatticeBlueprintManifest,
>(
  blueprint: TBlueprint,
  patch: BlueprintPatch<TBlueprint['steps'][number]['target'][]>,
): NormalizeBlueprintState<TBlueprint> => {
  const merged = {
    ...blueprint,
    ...patch,
    steps: patch.steps ?? blueprint.steps,
    route: patch.steps ? normalizeBlueprintRoute(String(blueprint.tenantId), `${patch.steps[0]}`) : blueprint.route,
  };

  return merged as NormalizeBlueprintState<TBlueprint>;
};

export const listBlueprintSteps = <
  TBlueprint extends LatticeBlueprintManifest,
>(blueprint: TBlueprint): TBlueprint['steps'][number]['kind'][] => {
  return blueprint.steps.map((step) => step.kind);
};

export const toStepTuple = <
  TBlueprint extends LatticeBlueprintManifest,
>(blueprint: TBlueprint): TBlueprint['steps'] => {
  return [...blueprint.steps] as TBlueprint['steps'];
};

export const groupBlueprintsByTenant = <
  TBlueprint extends LatticeBlueprintManifest,
>(
  blueprints: readonly TBlueprint[],
): Readonly<Record<LatticeTenantId, readonly TBlueprint[]>> => {
  const out = Object.create(null) as Record<string, TBlueprint[]>;
  for (const blueprint of blueprints) {
    const key = String(blueprint.tenantId);
    const list = out[key] ?? [];
    list.push(blueprint);
    out[key] = list;
  }

  return out as Readonly<Record<LatticeTenantId, readonly TBlueprint[]>>;
};

export const makeBlueprintDigest = <
  TBlueprint extends LatticeBlueprintManifest,
>(blueprint: TBlueprint): string => {
  const stepSignatures = blueprint.steps
    .map((step) => `${step.id}:${step.kind}:${step.target}`)
    .join('|');
  return withBrand(`${blueprint.blueprintId}-${blueprint.version}-${stepSignatures}`, 'blueprint:digest');
};
