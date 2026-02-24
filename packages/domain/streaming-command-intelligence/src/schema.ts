import { z } from 'zod';
import {
  asStreamId,
  asCommandEnvelopeId,
  asCommandPlanId,
  asCommandPolicyId,
  asCommandPluginId,
  asCommandResultId,
  asCommandStepId,
  asCommandTag,
  asSignalBus,
  asCommandTraceId,
  asCommandTenantId,
  commandNamespaces,
  ChannelTag,
  SignalBus,
  CommandNamespace,
  CommandPolicy,
  CommandPlan,
  CommandPolicyByPriority,
  CommandPlanStepDescriptor,
  CommandRunContext,
  CommandRunResult,
  CommandSignalEnvelope,
} from './types';

const namespaceSchema = z.enum(commandNamespaces);

const commandStepSchema = z.object({
  pluginId: z.string().min(1).optional(),
  name: z.string().min(1),
  namespace: namespaceSchema,
  pluginKind: z.string().regex(/^(ingest|analyze|synthesize|execute|verify|rollback)-plugin$/),
  latencyBudgetMs: z.number().nonnegative().default(250),
  consumes: z.array(z.string()).default([]),
  emits: z.array(z.string()).default([]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  config: z.record(z.unknown()).default({}),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  behavior: z.enum(['echo', 'augment', 'transform']).default('echo'),
  stepId: z.string().min(1),
});

const rawPlanSchema = z.object({
  planId: z.string().min(1),
  name: z.string().min(1),
  tenantId: z.string().min(1),
  streamId: z.string().min(1),
  expectedDurationMs: z.number().positive(),
  labels: z.record(z.string(), z.string()),
  config: z.record(z.string(), z.unknown()),
  plugins: z.array(commandStepSchema).min(1),
});

const rawPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priority: z.number().int().min(1).max(10),
  tags: z.array(z.string()),
  allowedNamespaces: z.array(namespaceSchema),
  requires: z.array(z.string()),
  emits: z.array(z.string()),
  metadata: z.record(z.unknown()),
});

const rawContextSchema = z.object({
  tenantId: z.string().min(1),
  streamId: z.string().min(1),
  planId: z.string().min(1),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'suppressed']),
  startedAt: z.string().datetime({ offset: true }),
  commandCount: z.number().int().min(0),
});

const rawResultSchema = z.object({
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'suppressed']),
  streamId: z.string().min(1),
  warnings: z.array(z.string()),
  tags: z.array(z.string()),
  output: z.unknown(),
  score: z.object({
    score: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    severity: z.number().int().min(1).max(5),
  }),
});

const rawEnvelopeSchema = z.object({
  tenantId: z.string().min(1),
  streamId: z.string().min(1),
  namespace: namespaceSchema,
  envelopeId: z.string().min(1),
  traceId: z.string().min(1),
  pluginKind: z.string().regex(/^(ingest|analyze|synthesize|execute|verify|rollback)-plugin$/),
  tags: z.array(z.string()),
  seenAt: z.string().datetime({ offset: true }),
  payload: z.unknown(),
  context: z.record(z.unknown()),
  signals: z.array(z.record(z.unknown())),
  metadata: z.record(z.unknown()),
});

const normalizeChannelTag = (value: string): ChannelTag => asCommandTag(value);

const normalizeSignalBus = (value: string): `signals.${string}` => {
  const normalized = value.startsWith('signals.') ? value : `signals.${value}`;
  return normalized as SignalBus;
};

const toNamespaceSignals = (values: readonly string[]): readonly ChannelTag[] => values.map((value: string) => normalizeChannelTag(value));

const toSignalBusList = (values: readonly string[]): readonly `signals.${string}`[] => values.map((value: string) => normalizeSignalBus(value));

const inflateStep = (planId: ReturnType<typeof asCommandPlanId>, tenantId: ReturnType<typeof asCommandTenantId>) =>
  (descriptor: z.infer<typeof commandStepSchema>, index: number): CommandPlanStepDescriptor => {
    const namespace = descriptor.namespace as CommandNamespace;
    const pluginKind = `${namespace}-plugin` as CommandPlanStepDescriptor['kind'];
    const behavior = (descriptor.behavior ?? 'echo') as CommandPlanStepDescriptor['behavior'];
    return {
      pluginId: asCommandPluginId(descriptor.pluginId ?? `${tenantId}:${planId}:${descriptor.name}:${index}`),
      name: descriptor.name,
      kind: pluginKind,
      namespace,
      version: descriptor.version as `${number}.${number}.${number}`,
      consumes: toNamespaceSignals(descriptor.consumes),
      emits: toSignalBusList(descriptor.emits),
      config: descriptor.config,
      input: descriptor.input ?? {},
      output: descriptor.output ?? {},
      stepId: asCommandStepId(descriptor.stepId),
      behavior,
      latencyBudgetMs: descriptor.latencyBudgetMs,
    };
  };

export type CommandPlanDto = z.infer<typeof rawPlanSchema>;
export type CommandPolicyDto = z.infer<typeof rawPolicySchema>;
export type CommandRunContextDto = z.infer<typeof rawContextSchema>;
export type CommandResultDto = z.infer<typeof rawResultSchema>;
export type CommandEnvelopeDto = z.infer<typeof rawEnvelopeSchema>;

export const parseCommandPlan = (payload: unknown): CommandPlan => {
  const parsed = rawPlanSchema.parse(payload);
  const tenantId = asCommandTenantId(parsed.tenantId);
  const planId = asCommandPlanId(parsed.planId);
  const streamId = asStreamId(parsed.streamId);
  const inflater = inflateStep(planId, tenantId);

  return {
    planId,
    name: parsed.name,
    tenantId,
    streamId,
    expectedDurationMs: parsed.expectedDurationMs,
    labels: parsed.labels,
    config: parsed.config,
    plugins: parsed.plugins.map((descriptor: z.infer<typeof commandStepSchema>, index: number) => inflater(descriptor, index)),
  };
};

export const parseCommandPolicy = (payload: unknown): CommandPolicy => {
  const parsed = rawPolicySchema.parse(payload);
  const priorityBand: CommandPolicyByPriority<number> = parsed.priority <= 2
    ? 'minimal'
    : parsed.priority <= 4
      ? 'normal'
      : 'aggressive';

  return {
    ...parsed,
    id: asCommandPolicyId(parsed.id),
    tags: [...parsed.tags],
    allowedNamespaces: [...parsed.allowedNamespaces],
    requires: toNamespaceSignals(parsed.requires),
    emits: toSignalBusList(parsed.emits),
    metadata: {
      ...parsed.metadata,
      priorityBand,
    },
  };
};

export const parseCommandContext = (payload: unknown): CommandRunContext => {
  const parsed = rawContextSchema.parse(payload);
  return {
    ...parsed,
    tenantId: asCommandTenantId(parsed.tenantId),
    streamId: asStreamId(parsed.streamId),
    planId: asCommandPlanId(parsed.planId),
  };
};

export const parseCommandResult = (payload: unknown): CommandRunResult => {
  const parsed = rawResultSchema.parse(payload);
  return {
    ...parsed,
    output: parsed.output,
    tags: parsed.tags.map((value: string) => normalizeChannelTag(value)),
    resultId: asCommandResultId(`result:${parsed.streamId}:${Date.now()}`),
    traceId: asCommandTraceId(`trace:${Date.now()}`),
    streamId: asStreamId(parsed.streamId),
    score: {
      ...parsed.score,
      severity: parsed.score.severity as 1 | 2 | 3 | 4 | 5,
    },
  };
};

export const parseCommandEnvelope = (payload: unknown): CommandSignalEnvelope => {
  const parsed = rawEnvelopeSchema.parse(payload);
  const runId = parsed.context?.['runId'] ? asCommandPlanId(String(parsed.context.runId)) : asCommandPlanId(`${parsed.traceId}:${parsed.envelopeId}`);
  return {
    ...parsed,
    tenantId: asCommandTenantId(parsed.tenantId),
    streamId: asStreamId(parsed.streamId),
    envelopeId: asCommandEnvelopeId(parsed.envelopeId),
    traceId: asCommandTraceId(parsed.traceId),
    tags: parsed.tags.map((value: string) => normalizeChannelTag(value)),
    signals: [],
    payload: parsed.payload,
    metadata: parsed.metadata,
    context: {
      ...(parsed.context as Record<string, unknown>),
      pluginId: parsed.context?.['pluginId'] as CommandSignalEnvelope['context']['pluginId'],
      pluginName: parsed.context?.['pluginName'] as string | undefined,
      latencyMs: Number(parsed.context?.['latencyMs'] ?? 0),
      status: parsed.context?.['status'] as CommandSignalEnvelope['context']['status'],
      runId,
      message: parsed.context?.['message'] as string | undefined,
    },
    pluginKind: `${parsed.namespace}-plugin` as CommandSignalEnvelope['pluginKind'],
  };
};

export const commandPolicySchemaDefaults = {
  id: 'policy-plain',
  name: 'default-policy',
  priority: 2,
  tags: ['default', 'realtime'],
  allowedNamespaces: ['ingest', 'analyze', 'synthesize'],
  requires: [asCommandTag('signal.stream'), asCommandTag('signal.policy')],
  emits: [asSignalBus('pipeline.commands')],
  metadata: { source: 'streaming-command-intelligence' },
} satisfies Omit<CommandPolicy, 'id'> & { id: string };

export const commandNamespacesList = [...commandNamespaces] as const;

export { asCommandPlanId, asCommandTag, asSignalBus, asCommandPolicyId };

export const resolveStepPriority = (index: number): number => ((index + 1) * 100) / 7;

export const validateTagList = <T extends readonly string[]>(tags: T): readonly ChannelTag[] => tags.map(asCommandTag);
