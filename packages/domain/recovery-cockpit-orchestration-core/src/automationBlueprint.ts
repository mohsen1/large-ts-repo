import { Brand, type OmitNever, type PathTuple, type Prettify, type Brand as BrandAlias } from '@shared/type-level';
import { z } from 'zod';

export type AutomationStage = 'discover' | 'compose' | 'execute' | 'verify' | 'audit';
export type AutomationTier = AutomationStage;

export type StageRoute = `${AutomationStage}:${string}`;
export type StagePath = `${AutomationStage}.${string}`;
export type PluginName = PluginId;
export type PluginId = BrandAlias<string, 'OrchestrationPluginId'>;

export type TenantId = BrandAlias<string, 'Tenant'>;
export type OperatorId = BrandAlias<string, 'Operator'>;
export type BlueprintId = BrandAlias<string, 'AutomationBlueprintId'>;
export type StepId = BrandAlias<string, 'BlueprintStep'>;
export type SchemaVersion = BrandAlias<string, 'SchemaVersion'>;

export type AutomationBlueprintHeader = Prettify<{
  readonly blueprintId: BlueprintId;
  readonly blueprintName: string;
  readonly version: SchemaVersion;
  readonly createdBy: OperatorId;
  readonly createdAt: string;
  readonly tags: readonly `blueprint:${string}`[];
}>;

export interface AutomationContext {
  readonly tenant: TenantId;
  readonly operator: string;
  readonly requestId: Brand<string, 'RequestId'>;
  readonly featureFlags: ReadonlySet<string>;
}

export interface RecoveryCockpitPluginDescriptor<
  Name extends PluginId = PluginId,
  Stage extends AutomationStage = AutomationStage,
  Input = object,
  Output = object,
  TContext extends AutomationContext = AutomationContext,
> {
  readonly pluginId: Name;
  readonly stage: Stage;
  readonly pluginLabel: string;
  readonly route: StageRoute;
  readonly schemaVersion: SchemaVersion;
  readonly supportedScopes: readonly ('global' | 'regional' | 'service')[];
  readonly requires: readonly AutomationStage[];
  readonly provides: readonly AutomationStage[];
  readonly inputExample: Input;
  readonly run: (input: Input, context: TContext) => Promise<PluginRunResult<Output>>;
}

export type PluginOutputFromDescriptor<TDescriptor> = TDescriptor extends RecoveryCockpitPluginDescriptor<
  infer _N,
  infer _S,
  infer _I,
  infer O
>
  ? O
  : never;

export type PluginInputFromDescriptor<TDescriptor> = TDescriptor extends RecoveryCockpitPluginDescriptor<
  infer _N,
  infer _S,
  infer I,
  infer _O
>
  ? I
  : never;

export type PluginInputTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...PluginInputTuple<Tail>]
  : [];

export type RequiredInput<T extends Record<string, unknown>> = OmitNever<{
  [K in keyof T]: T[K] extends undefined ? never : K;
}>;

export type PluginRuntimeState = 'queued' | 'running' | 'succeeded' | 'failed' | 'warning';

export type PluginRunResult<TOutput> = Readonly<{
  readonly state: PluginRuntimeState;
  readonly output: TOutput;
  readonly metrics: Readonly<Record<string, number>>;
  readonly warnings: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
}>;

export type AutomationBlueprintStep<TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>> = Readonly<{
  readonly stepId: StepId;
  readonly plugin: TDescriptor;
  readonly dependsOn: readonly StepId[];
  readonly timeoutMs: number;
  readonly retries: number;
  readonly metadata: {
    readonly owner: OperatorId;
    readonly priority: 'low' | 'normal' | 'high' | 'critical';
  };
}>;

export type AutomationBlueprint<
  TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage> = RecoveryCockpitPluginDescriptor<
    PluginId,
    AutomationStage
  >,
> = Prettify<{
  readonly header: AutomationBlueprintHeader;
  readonly steps: readonly AutomationBlueprintStep<TDescriptor>[];
  readonly policies: Readonly<Record<string, string>>;
  readonly pathIndex: PathTuple<AutomationBlueprintHeader>;
  readonly stagePaths: readonly StagePath[];
}>;

export const defaultStageOrder = ['discover', 'compose', 'execute', 'verify', 'audit'] as const satisfies readonly AutomationStage[];

export const stageSignature = (stage: AutomationStage): StageRoute => `${stage}:route`;

export const buildDefaultBlueprint = <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  descriptor: TDescriptor,
): AutomationBlueprint<TDescriptor> => {
  const header: AutomationBlueprintHeader = {
    blueprintId: `blueprint:${Date.now()}` as BlueprintId,
    blueprintName: 'Recovery Cockpit Default',
    version: 'v1' as SchemaVersion,
    createdBy: 'system' as OperatorId,
    createdAt: new Date().toISOString(),
    tags: ['blueprint:default'],
  };

  return {
    header,
    steps: [
      {
        stepId: `step:${Date.now()}:default` as StepId,
        plugin: descriptor,
        dependsOn: [`seed:${descriptor.pluginId}` as StepId],
        timeoutMs: 1200,
        retries: 1,
        metadata: {
          owner: 'system' as OperatorId,
          priority: 'normal',
        },
      },
    ],
    policies: {
      mode: 'strict',
      owner: String(descriptor.pluginLabel),
    },
    pathIndex: [['blueprintId'], ['blueprintName'], ['version']] as unknown as PathTuple<AutomationBlueprintHeader>,
    stagePaths: ['discover.compose.execute.verify.audit'] as readonly StagePath[],
  };
};

export const pluginPathTuple = defaultStageOrder
  .map((value, index) => [`stage-${index}`, value] as const)
  .map((value) => value.join(':')) as readonly `${string}:${AutomationStage}`[];

export const pluginStageWeights = defaultStageOrder.map((stage, index) => [stage, index + 1] as const);

export const deriveInputDefaults = <
  TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>,
>(
  descriptor: TDescriptor,
): PluginInputFromDescriptor<TDescriptor> => {
  return descriptor.inputExample as PluginInputFromDescriptor<TDescriptor>;
};

export const parseBlueprintFromJson = (source: string): AutomationBlueprint | undefined => {
  const parsed = automationBlueprintSchema.safeParse(JSON.parse(source)) as z.SafeParseReturnType<
    unknown,
    ParsedAutomationBlueprint
  >;
  if (!parsed.success) {
    return undefined;
  }

  const normalizeHeader = (payload: ParsedAutomationBlueprint['header']): AutomationBlueprintHeader => ({
    blueprintId: payload.blueprintId as BlueprintId,
    blueprintName: payload.blueprintName,
    version: payload.version as SchemaVersion,
    createdBy: payload.createdBy as OperatorId,
    createdAt: payload.createdAt,
    tags: payload.tags.map((tag) => tag as `blueprint:${string}`),
  });

  const normalize = (descriptor: (typeof parsed.data.steps)[number]['plugin']): RecoveryCockpitPluginDescriptor<PluginId, AutomationStage> => ({
    pluginId: descriptor.pluginId as PluginId,
    stage: descriptor.stage as AutomationStage,
    pluginLabel: descriptor.pluginLabel,
    route: `${descriptor.stage}:${descriptor.pluginId}` as StageRoute,
    schemaVersion: descriptor.schemaVersion as SchemaVersion,
    supportedScopes: descriptor.supportedScopes,
    requires: descriptor.requires as AutomationStage[],
    provides: descriptor.provides as AutomationStage[],
    inputExample: {} as never,
    run: async () => ({
      state: 'succeeded',
      output: {} as never,
      metrics: { parsed: 1 },
      warnings: [],
      errors: [],
    }),
  });

  return {
    header: normalizeHeader(parsed.data.header),
    steps: parsed.data.steps.map((step, index) => ({
      stepId: `step:${index}:${parsed.data.header.blueprintId}` as StepId,
      plugin: normalize(step.plugin),
      dependsOn: step.dependsOn.map((dependency) => dependency as StepId),
      timeoutMs: step.timeoutMs,
      retries: step.retries,
      metadata: {
        owner: step.metadata.owner as OperatorId,
        priority: step.metadata.priority,
      },
    })),
    policies: parsed.data.policies,
    pathIndex: parsed.data.pathIndex as unknown as PathTuple<AutomationBlueprintHeader>,
    stagePaths: (parsed.data.stagePaths as readonly string[]).map((path) => path as StagePath),
  } satisfies AutomationBlueprint;
};

const pluginSchema = z.object({
  pluginId: z.string().min(4),
  stage: z.enum(defaultStageOrder),
  pluginLabel: z.string().min(3),
  route: z.string().regex(/^(discover|compose|execute|verify|audit):/),
  schemaVersion: z.string().regex(/^v\d+$/),
  supportedScopes: z.array(z.enum(['global', 'regional', 'service'])).default([]),
  requires: z.array(z.string()).default([]),
  provides: z.array(z.string()).default([]),
}).strict();

const headerSchema = z.object({
  blueprintId: z.string().min(6),
  blueprintName: z.string().min(3),
  version: z.string().regex(/^v\d+$/),
  createdBy: z.string().min(1),
  createdAt: z.string(),
  tags: z.array(z.string()).default([]),
}).strict();

const stepSchema = z.object({
  stepId: z.string().min(3),
  plugin: pluginSchema,
  dependsOn: z.array(z.string()).default([]),
  timeoutMs: z.number().positive().default(1000),
  retries: z.number().int().min(0).max(9).default(1),
  metadata: z.object({
    owner: z.string().min(1),
    priority: z.enum(['low', 'normal', 'high', 'critical']),
  }),
}).strict();

export const automationBlueprintSchema = z
  .object({
    header: headerSchema,
    steps: z.array(stepSchema),
    policies: z.record(z.string()),
    pathIndex: z.array(z.array(z.string())).default([['blueprintId']]),
    stagePaths: z.array(z.string()).default(['discover.compose.execute.verify.audit']),
  })
  .strict();

const isKnownStage = (value: string): value is AutomationStage => (defaultStageOrder as readonly string[]).includes(value);

export type ParsedAutomationBlueprint = z.output<typeof automationBlueprintSchema>;
