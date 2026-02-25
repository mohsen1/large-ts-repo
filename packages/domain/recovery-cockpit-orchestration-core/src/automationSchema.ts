import { z } from 'zod';
import {
  type AutomationBlueprint,
  type AutomationBlueprintHeader,
  type AutomationBlueprintStep,
  type PluginId,
  type AutomationStage,
  type StepId,
  buildDefaultBlueprint,
  type PluginInputFromDescriptor,
  type RecoveryCockpitPluginDescriptor,
  type PluginRunResult,
} from './automationBlueprint';

const pluginSchema = z
  .object({
    pluginId: z.string().min(4),
    stage: z.enum(['discover', 'compose', 'execute', 'verify', 'audit']),
    pluginLabel: z.string().min(3),
    route: z.string().regex(/^(discover|compose|execute|verify|audit):/),
    schemaVersion: z.string().regex(/^v\d+$/),
    supportedScopes: z.array(z.enum(['global', 'regional', 'service'])).default(['global']),
    requires: z.array(z.enum(['discover', 'compose', 'execute', 'verify', 'audit'])).default([]),
    provides: z.array(z.enum(['discover', 'compose', 'execute', 'verify', 'audit'])).default([]),
  })
  .strict();

const stepSchema = z
  .object({
    stepId: z.string().min(3),
    plugin: pluginSchema,
    dependsOn: z.array(z.string()).default([]),
    timeoutMs: z.number().int().positive().default(500),
    retries: z.number().int().min(0).max(5).default(1),
    metadata: z
      .object({
        owner: z.string().min(2),
        priority: z.enum(['low', 'normal', 'high', 'critical']),
      })
      .strict(),
  })
  .strict();

const headerSchema = z
  .object({
    blueprintId: z.string().min(5),
    blueprintName: z.string().min(3),
    version: z.string().regex(/^v\d+$/),
    createdBy: z.string().min(2),
    createdAt: z.string(),
    tags: z.array(z.string()).default([]),
  })
  .strict();

export const automationBlueprintSchema = z
  .object({
    header: headerSchema,
    steps: z.array(stepSchema),
    policies: z.record(z.string()),
    pathIndex: z.array(z.array(z.string())).default([['blueprintId']]),
    stagePaths: z.array(z.string()).default(['discover.compose.execute.verify.audit']),
  })
  .strict();

export type ParsedAutomationBlueprint = z.output<typeof automationBlueprintSchema>;

export type BlueprintParseError = {
  readonly kind: 'invalid-json' | 'invalid-schema';
  readonly message: string;
};

const normalizePluginDescriptor = (plugin: ParsedAutomationBlueprint['steps'][number]['plugin']): RecoveryCockpitPluginDescriptor<PluginId, AutomationStage> => ({
  pluginId: plugin.pluginId as PluginId,
  stage: plugin.stage,
  pluginLabel: plugin.pluginLabel,
  route: plugin.route as `${AutomationStage}:${string}`,
  schemaVersion: plugin.schemaVersion as any,
  supportedScopes: plugin.supportedScopes,
  requires: plugin.requires,
  provides: plugin.provides,
  inputExample: {} as never,
  run: async () => ({
    state: 'succeeded',
    output: {} as never,
    metrics: { parsed: 1 },
    warnings: [],
    errors: [],
  }),
});

const normalizeHeader = (header: ParsedAutomationBlueprint['header']): AutomationBlueprintHeader => ({
  blueprintId: header.blueprintId as AutomationBlueprintHeader['blueprintId'],
  blueprintName: header.blueprintName,
  version: header.version as AutomationBlueprintHeader['version'],
  createdBy: header.createdBy as AutomationBlueprintHeader['createdBy'],
  createdAt: header.createdAt,
  tags: header.tags.map((value) => value as AutomationBlueprintHeader['tags'][number]),
});

const stepToTuple = (
  step: ParsedAutomationBlueprint['steps'][number],
  index: number,
  fallback: RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>,
): AutomationBlueprintStep<RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>> => ({
  stepId: `step:${index}` as StepId,
  plugin: index === 0 ? normalizePluginDescriptor(step.plugin) : fallback,
  dependsOn: step.dependsOn.length > 0 ? step.dependsOn.map((dependency) => dependency as StepId) : [`seed:${step.stepId}` as StepId],
  timeoutMs: step.timeoutMs,
  retries: step.retries,
  metadata: {
    owner: step.metadata.owner as AutomationBlueprintHeader['createdBy'],
    priority: step.metadata.priority,
  },
});

export const parseBlueprintSchema = (payload: string): ParsedAutomationBlueprint | BlueprintParseError => {
  try {
    const parsed = automationBlueprintSchema.safeParse(JSON.parse(payload));
    if (!parsed.success) {
      return {
        kind: 'invalid-schema',
        message: parsed.error.issues.map((item) => item.message).join(', '),
      };
    }
    return parsed.data;
  } catch {
    return {
      kind: 'invalid-json',
      message: 'cannot parse JSON',
    };
  }
};

export const hydrateBlueprint = (payload: ParsedAutomationBlueprint): AutomationBlueprint => {
  const header = normalizeHeader(payload.header);
  const fallback = buildDefaultBlueprint(normalizePluginDescriptor(payload.steps[0]?.plugin ?? {
    pluginId: 'plugin:fallback',
    stage: 'discover',
    pluginLabel: 'fallback',
    route: 'discover:fallback',
    schemaVersion: 'v1',
    supportedScopes: ['global'],
    requires: [],
    provides: ['compose'],
    inputExample: {},
    run: async () => ({
      state: 'succeeded',
      output: {},
      metrics: {},
      warnings: [],
      errors: [],
    }),
  }));

  const descriptor = normalizePluginDescriptor(payload.steps[0]?.plugin ?? {
    pluginId: 'plugin:fallback',
    stage: 'discover',
    pluginLabel: 'fallback',
    route: 'discover:fallback',
    schemaVersion: 'v1',
    supportedScopes: ['global'],
    requires: [],
    provides: ['compose'],
  });

  return {
    header,
    steps: payload.steps.map((step, index) => stepToTuple(step, index, index === 0 ? descriptor : fallback.steps[0]!.plugin)),
    policies: { ...fallback.policies, ...payload.policies },
    pathIndex: payload.pathIndex as unknown as AutomationBlueprint['pathIndex'],
    stagePaths: payload.stagePaths as unknown as AutomationBlueprint['stagePaths'],
  };
};

export const parseBlueprintFromJson = (payload: string): AutomationBlueprint | undefined => {
  const parsed = parseBlueprintSchema(payload);
  if ('kind' in parsed) {
    return undefined;
  }
  return hydrateBlueprint(parsed);
};

export const serializeBlueprint = (blueprint: AutomationBlueprint): string =>
  JSON.stringify(
    {
      header: blueprint.header,
      steps: blueprint.steps.map((step) => ({
        ...step,
        plugin: {
          pluginId: step.plugin.pluginId,
          stage: step.plugin.stage,
          pluginLabel: step.plugin.pluginLabel,
          route: step.plugin.route,
          schemaVersion: step.plugin.schemaVersion,
          supportedScopes: step.plugin.supportedScopes,
          requires: step.plugin.requires,
          provides: step.plugin.provides,
        },
      })),
      policies: blueprint.policies,
      pathIndex: blueprint.pathIndex,
      stagePaths: blueprint.stagePaths,
    },
    null,
    2,
  );

export const sampleBlueprintFromText = (blueprintName: string): string => {
  const payload: ParsedAutomationBlueprint = {
    header: {
      blueprintId: `blueprint:${blueprintName}:sample`,
      blueprintName,
      version: 'v1',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      tags: ['blueprint:sample'],
    },
    steps: [
      {
        stepId: 'step:sample',
        plugin: {
          pluginId: 'plugin:discover',
          stage: 'discover',
          pluginLabel: 'discover',
          route: 'discover:core',
          schemaVersion: 'v1',
          supportedScopes: ['global'],
          requires: [],
          provides: ['compose'],
        },
        dependsOn: [],
        timeoutMs: 1000,
        retries: 1,
        metadata: {
          owner: 'system',
          priority: 'normal',
        },
      },
      {
        stepId: 'step:sample-compose',
        plugin: {
          pluginId: 'plugin:compose',
          stage: 'compose',
          pluginLabel: 'compose',
          route: 'compose:core',
          schemaVersion: 'v1',
          supportedScopes: ['global'],
          requires: ['discover'],
          provides: ['execute'],
        },
        dependsOn: ['step:sample'],
        timeoutMs: 900,
        retries: 2,
        metadata: {
          owner: 'system',
          priority: 'high',
        },
      },
    ],
    policies: { mode: 'auto', owner: 'system' },
    pathIndex: [['header', 'blueprintId'], ['steps', '0', 'plugin', 'pluginId']],
    stagePaths: ['discover.compose.execute.verify.audit'],
  };

  return serializeBlueprint(hydrateBlueprint(payload));
};

export const decodeBlueprint = (payload: string): string | undefined => {
  const parsed = parseBlueprintFromJson(payload);
  if (!parsed) return undefined;
  return JSON.stringify({ blueprintId: parsed.header.blueprintId, tags: parsed.header.tags });
};

export const isKnownStage = (value: string): value is AutomationStage =>
  (['discover', 'compose', 'execute', 'verify', 'audit'] as const).includes(value as AutomationStage);

export const ensureRunPayload = <
  TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>,
>(payload: PluginInputFromDescriptor<TDescriptor>): PluginInputFromDescriptor<TDescriptor> => payload;
