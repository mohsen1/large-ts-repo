import {
  asCommandTag,
  asCommandPlanId,
  asSignalBus,
  asCommandPolicyId,
  asCommandPluginId,
  asCommandResultId,
  asCommandStepId,
  asCommandTraceId,
  asStreamId,
  commandNamespaces,
  parseCommandPlan,
  CommandPlan,
  CommandPolicy,
  CommandPolicyByPriority,
  CommandRunResult,
  StreamCommandPluginId,
  CommandTenantId,
} from '@domain/streaming-command-intelligence';
import { runCommandIntelligence, CommandIntelligenceOrchestrationOutput } from '@service/streaming-command-intelligence-orchestrator';
import { InMemoryCommandIntelligenceStore } from '@data/streaming-command-intelligence-store';

const bootstrapStore = new InMemoryCommandIntelligenceStore({ maxRows: 2_500 });

interface DashboardTemplate {
  readonly streamId: string;
  readonly requestedAt: string;
  readonly mode: 'reseed' | 'toggle';
  readonly version: string;
}

const planSeeds: Promise<readonly string[]> = Promise.resolve(['seed:ingest', 'seed:analyze', 'seed:execute']);

const catalogSeed = await (async () => {
  const seeds = await planSeeds;
  return seeds.map((seed, index) => ({ id: seed, sequence: index }));
})();

export const commandSchemaDefaults = (input: DashboardTemplate): DashboardTemplate => ({
  ...input,
  requestedAt: input.requestedAt,
  mode: input.mode,
  version: `${input.version}::${input.streamId}`,
});

const resolvePolicyBand = (priority: number): CommandPolicyByPriority<number> => {
  if (priority <= 2) return 'minimal';
  if (priority <= 4) return 'normal';
  return 'aggressive';
};

const bootstrapPolicy = (): CommandPolicy => {
  const defaultPriority = 5;
  const rank = resolvePolicyBand(defaultPriority);

  return {
    id: asCommandPolicyId(`policy:${rank}:${catalogSeed.length}`),
    name: 'stream-dashboard-default',
    priority: defaultPriority,
    tags: ['dashboard', 'default', 'streaming-command-intelligence'],
    allowedNamespaces: [...commandNamespaces],
    requires: [asCommandTag('policy.required')],
    emits: [asSignalBus('commands'), asSignalBus('commands.ready')],
    metadata: {
      source: 'stream-dashboard',
      rank,
      seedSize: catalogSeed.length,
    },
  };
};

const buildStepPlan = (tenantId: CommandTenantId, streamId: string, index: number) => ({
  pluginId: asCommandPluginId(`${tenantId}:${streamId}:${index}`),
  name: `seed-step-${index}`,
  namespace: commandNamespaces[index % commandNamespaces.length],
  pluginKind: `${commandNamespaces[index % commandNamespaces.length]}-plugin`,
  latencyBudgetMs: 25 + index * 10,
  consumes: [asCommandTag('signal.seed')],
  emits: [asSignalBus('pipeline.seed')],
  version: '1.0.0',
  config: {
    seed: catalogSeed[index]?.id ?? 'seed',
    index,
    bootstrap: true,
  },
  input: {
    streamId,
    tenantId,
  },
  output: {
    namespace: commandNamespaces[index % commandNamespaces.length],
    step: `seed-step-${index}`,
  },
  stepId: asCommandStepId(`${tenantId}:${streamId}:${index}`),
  behavior: 'echo' as const,
});

export const buildPlanFromDefaults = (tenantId: string, streamId: string): CommandPlan => {
  const seedPlan = {
    planId: `${tenantId}:${streamId}:${Date.now()}`,
    name: `dashboard-plan-${streamId}`,
    tenantId,
    streamId,
    expectedDurationMs: 1_900,
    labels: {
      source: 'stream-dashboard',
      mode: 'ui',
      catalog: catalogSeed.length.toString(),
    },
    config: {
      planType: 'ui',
      requestedAt: new Date().toISOString(),
      tags: ['dashboard', 'ui'],
    },
    plugins: [
      buildStepPlan(tenantId as CommandTenantId, streamId, 0),
      buildStepPlan(tenantId as CommandTenantId, streamId, 1),
    ],
  };

  return parseCommandPlan(seedPlan);
};

const sanitizePolicy = (): CommandPolicy => ({
  id: asCommandPolicyId('policy:stream-dashboard'),
  name: 'stream-dashboard-default',
  priority: 5,
  tags: ['dashboard', 'default', 'streaming-command-intelligence'],
  allowedNamespaces: [...commandNamespaces],
  requires: [asCommandTag('policy.required')],
  emits: [asSignalBus('commands'), asSignalBus('commands.ready')],
  metadata: {
    source: 'stream-dashboard',
    rank: resolvePolicyBand(5),
    seedSize: catalogSeed.length,
  },
});

export const runDashboardIntelligence = async (
  rawPlan: unknown,
): Promise<ReturnType<typeof runCommandIntelligence>> => {
  const plan = parseCommandPlan(rawPlan);
  const policy = sanitizePolicy();
  return runCommandIntelligence({
    tenantId: plan.tenantId,
    streamId: plan.streamId,
    policy,
    rawPlan: plan,
    store: bootstrapStore,
  });
};

export const normalizeCommandResult = <T>(value: T): CommandRunResult => {
  return {
    status: 'succeeded',
    traceId: asCommandTraceId(`result:${Date.now()}`),
    resultId: asCommandResultId(`result:${Date.now()}:1`),
    streamId: asStreamId('stream-dashboard-default'),
    output: value,
    score: {
      score: 1,
      confidence: 1,
      severity: 1,
    },
    warnings: [],
    tags: [asCommandTag('command-result')],
  };
};

export { asCommandPlanId };

export const parseDashboardAction = (input: { mode: 'toggle' | 'reseed'; planId: string; streamId: string }) => {
  const normalized = commandSchemaDefaults({
    streamId: input.streamId,
    requestedAt: new Date().toISOString(),
    mode: input.mode,
    version: `action:${input.mode}`,
  });
  return {
    action: input.mode,
    streamId: input.streamId,
    planId: input.planId,
    seed: catalogSeed,
    version: normalized.version,
  };
};

export const toReadableDashboardSummary = (result: CommandIntelligenceOrchestrationOutput): string =>
  `${result.status} :: ${result.commandCount} plugins :: ${result.profile.namespaceCounts && Object.keys(result.profile.namespaceCounts).length} namespaces`;

export const commandIntelligenceDefaults = buildPlanFromDefaults('tenant:dashboard', 'stream-dashboard-main');
