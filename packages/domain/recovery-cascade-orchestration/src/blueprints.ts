import { z } from 'zod';
import type { Brand } from '@shared/core';

export type TenantId = Brand<string, 'TenantId'>;
export type RunId = Brand<string, 'RunId'>;
export type StageRef = Brand<string, 'StageRef'>;
export type StageName = `stage.${string}`;
export type StageDependencyTag = `dep:${string}`;

const manifestVersionPattern = /^v\d+\.\d+\.\d$/;

export interface StageContract<
  TName extends StageName = StageName,
  TInput = unknown,
  TOutput = unknown,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: TName;
  readonly stageId: StageRef;
  readonly dependencies: readonly StageDependencyTag[];
  readonly input: TInput;
  readonly output: TOutput;
  readonly metadata: TMeta;
}

export interface BlueprintManifest<
  TName extends string = string,
  TStages extends readonly StageContract[] = readonly StageContract[],
> {
  readonly tenantId: TenantId;
  readonly name: TName;
  readonly version: `v${number}.${number}.${number}`;
  readonly stages: TStages;
  readonly tags: readonly string[];
}

export const blueprintSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  version: z.string(),
  stages: z.array(
    z.object({
      name: z.string(),
      stageId: z.string(),
      dependencies: z.array(z.string()),
      input: z.unknown(),
      output: z.unknown(),
      metadata: z.record(z.unknown()),
    }),
  ),
  tags: z.array(z.string()),
});

export const isBlueprint = (value: unknown): value is BlueprintManifest => {
  return blueprintSchema.safeParse(value).success;
};

export type StagePath<T extends string> =
  | T
  | `${T}.${string}`
  | `${T}[${number}]`
  | `${T}[${number}].${string}`;

export type StageGraph<TItems extends readonly StageContract[]> = {
  [K in TItems[number] as K['name']]: K;
};

export type StagePayload<TStage extends StageContract> = TStage['input'];
export type StageOut<TStage extends StageContract> = TStage['output'];

export type PlanInputFromGraph<TGraph extends readonly StageContract[]> = {
  [K in TGraph[number] as K['name']]: K['input'];
};

export type PlanOutputFromGraph<TGraph extends readonly StageContract[]> = {
  [K in TGraph[number] as K['name']]: K['output'];
};

export interface BlueprintExecutionArgs<TGraph extends readonly StageContract[]> {
  readonly tenantId: TenantId;
  readonly blueprint: BlueprintManifest<string, TGraph>;
  readonly inputs: PlanInputFromGraph<TGraph>;
  readonly runId: RunId;
}

export interface BlueprintResult<TGraph extends readonly StageContract[]> {
  readonly blueprint: BlueprintManifest<string, TGraph>;
  readonly tenantId: TenantId;
  readonly runId: RunId;
  readonly outputs: Partial<PlanOutputFromGraph<TGraph>>;
  readonly startedAt: string;
  readonly finishedAt: string;
}

const normalizeVersion = (value: string): `v${number}.${number}.${number}` => {
  if (manifestVersionPattern.test(value)) {
    return value as `v${number}.${number}.${number}`;
  }

  const withPrefix = value.startsWith('v') ? value : `v${value}`;
  if (manifestVersionPattern.test(withPrefix)) {
    return withPrefix as `v${number}.${number}.${number}`;
  }

  return 'v1.0.0' satisfies `v${number}.${number}.${number}`;
};

export const buildDependencyTag = <T extends StageName>(value: T): StageDependencyTag => `dep:${value}` as StageDependencyTag;

const bootstrapStages = [
  {
    name: 'stage.ingest',
    stageId: 'stage-ingest' as StageRef,
    dependencies: [],
    metadata: {
      purpose: 'inbound payload normalization',
      risk: 'low',
    },
    input: { tenantId: 'tenant:core', payload: {} as Record<string, unknown> },
    output: { normalized: true, normalizedAt: new Date().toISOString() },
  },
  {
    name: 'stage.assemble',
    stageId: 'stage-assemble' as StageRef,
    dependencies: [buildDependencyTag('stage.ingest')],
    metadata: {
      purpose: 'cross-domain orchestration',
      risk: 'medium',
    },
    input: { plan: [] as string[] },
    output: { graph: { nodes: [] as string[] } },
  },
] as const satisfies readonly StageContract[];

export const bootstrapManifest: BlueprintManifest<'core-recovery-cascade', typeof bootstrapStages> = {
  tenantId: 'tenant:core' as TenantId,
  name: 'core-recovery-cascade',
  version: 'v1.0.0',
  stages: bootstrapStages,
  tags: ['recovery', 'cascade', 'orchestration'],
};

type RuntimeBlueprintInput<TStages extends readonly StageContract[]> = {
  tenantId: string;
  name: string;
  version: string;
  stages: TStages;
  tags: readonly string[];
};

export const asBlueprint = <TStages extends readonly StageContract[]>(manifest: RuntimeBlueprintInput<TStages>): BlueprintManifest<string, TStages> => {
  return {
    tenantId: manifest.tenantId as TenantId,
    name: manifest.name,
    version: normalizeVersion(manifest.version),
    stages: manifest.stages as TStages,
    tags: [...manifest.tags] as readonly string[],
  };
};

export type StageTemplate = StageContract<
  StageName,
  { tenantId: TenantId; eventBus?: string },
  { completed: boolean },
  { critical: boolean }
>;
