import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  PluginLifecycleContext,
  PluginName,
  PluginNamespace,
  PluginTag,
  PluginResult,
  PluginRegistry,
  PluginDefinition,
  RuntimeSignalMetadata,
} from './plugin-types';
import { tenantId, runPlanId, signalId, aggregateSignalTotals, type OrchestrationPlanInput, type OrchestrationPlanOutput } from '../domain/models';
import { asTuple, asReadonlyTuple } from '../domain/tuple-utils';

const pluginSeedSchema = z.array(
  z.object({
    name: z
      .string()
      .startsWith('plugin:')
      .transform((value): PluginName => value as PluginName),
    namespace: z
      .string()
      .startsWith('namespace:')
      .transform((value): PluginNamespace => value as PluginNamespace),
    version: z.string().regex(/^v\d+\.\d+$/),
    dependsOn: z.array(z.string().startsWith('plugin:')).default([]),
    tags: z.array(z.string().startsWith('tag:')).default([]),
    description: z.string(),
  }),
);

type PluginSeed = z.infer<typeof pluginSeedSchema>[number];

const rawSeeds: readonly PluginSeed[] = pluginSeedSchema.parse([
  {
    name: 'plugin:signal-normalizer',
    namespace: 'namespace:recovery-orchestration-lab',
    version: 'v1.0',
    dependsOn: [],
    tags: ['tag:normalization'],
    description: 'Normalize telemetry and enrich tags for downstream stages.',
  },
  {
    name: 'plugin:risk-evaluator',
    namespace: 'namespace:recovery-orchestration-lab',
    version: 'v1.1',
    dependsOn: ['plugin:signal-normalizer'],
    tags: ['tag:risk'],
    description: 'Evaluate weighted criticality for each incident signal.',
  },
  {
    name: 'plugin:policy-scheduler',
    namespace: 'namespace:recovery-orchestration-lab',
    version: 'v1.2',
    dependsOn: ['plugin:risk-evaluator'],
    tags: ['tag:scheduling'],
    description: 'Emit final orchestration directives and execution windows.',
  },
] as const);

const pluginNamespace: PluginNamespace = 'namespace:recovery-orchestration-lab';

const successResult = async <TOutput>(output: TOutput): Promise<PluginResult<TOutput>> => ({
  status: 'success',
  output,
  message: 'ok',
  telemetry: {
    scope: pluginNamespace,
    latencyMs: 17,
    signalCount: 0,
    metrics: {
      reliability: 0.99,
      throughput: 1.3,
      confidence: 0.88,
    },
  },
});

const toPluginDefinition = <TName extends PluginName, TInput, TOutput = OrchestrationPlanOutput>(
  seed: Omit<PluginSeed, 'name'> & { name: TName },
  run: (
    plan: TInput,
    context: PluginLifecycleContext,
    runtime: readonly RuntimeSignalMetadata[],
  ) => Promise<PluginResult<TOutput>>,
): PluginDefinition<TName, TInput, TOutput, PluginNamespace> => ({
  name: seed.name,
  namespace: pluginNamespace,
  version: seed.version as `v${number}.${number}`,
  dependsOn: asTuple(seed.dependsOn).map((entry) => entry as PluginName),
  tags: asTuple(seed.tags).map((entry) => entry as PluginTag<string>),
  description: seed.description,
  run,
});

const normalizePlugin = toPluginDefinition<'plugin:signal-normalizer', OrchestrationPlanInput, OrchestrationPlanOutput>({
  ...(rawSeeds[0] as PluginSeed),
  name: 'plugin:signal-normalizer',
}, async (plan: OrchestrationPlanInput) => {
  const output: OrchestrationPlanOutput = {
    runId: plan.runId,
    directives: plan.signals.map((signal, index) => ({
      name: `normalize:${signal.detail.code}`,
      weight: Number((1 / Math.max(1, plan.signals.length)).toFixed(3)),
      conditions: [signal.id, signal.category],
      controls: [{ service: signal.origin, action: signal.severity, priority: index + 1 }],
    })),
    artifacts: [
      {
        tenant: plan.tenant,
        runId: plan.runId,
        createdAt: new Date().toISOString(),
        checksums: {
          signalDigest: signalId(plan.signals[0]?.id ?? `signal-digest:${plan.runId}`),
        },
      },
    ],
    summary: `normalized:${plan.signals.length}`,
  };
  return successResult(output);
});

const riskPlugin = toPluginDefinition<'plugin:risk-evaluator', OrchestrationPlanOutput, OrchestrationPlanOutput>({
  ...(rawSeeds[1] as PluginSeed),
  name: 'plugin:risk-evaluator',
}, async (plan: OrchestrationPlanOutput) => {
  const totals = {
    critical: plan.directives.filter((entry) => entry.name.includes('critical')).length,
    high: plan.directives.filter((entry) => entry.name.includes('high')).length,
    moderate: plan.directives.filter((entry) => entry.name.includes('moderate')).length,
    low: plan.directives.filter((entry) => entry.name.includes('low')).length,
  };
  const weightsBySeverity: Record<'critical' | 'high' | 'moderate' | 'low', number> = {
    critical: 1,
    high: 0.8,
    moderate: 0.5,
    low: 0.2,
  };

  const directives = Object.entries(totals).map(([severity, count], index) => ({
    name: `risk:${severity}`,
    weight: (weightsBySeverity[severity as 'critical' | 'high' | 'moderate' | 'low'] ?? 0) * (count + 0.5),
    conditions: [severity, String(count)],
    controls: [{ service: 'risk-engine', action: severity, priority: count + index }],
  }));

  return successResult({
    runId: plan.runId,
    directives,
    artifacts: [
      {
        runId: plan.runId,
        createdAt: new Date().toISOString(),
        tenant: tenantId('tenant-omega'),
        checksums: {
          riskCurve: asTuple(Object.entries(totals).map(([severity, count]) => `${severity}:${count}`)).join('|'),
        },
      },
    ],
    summary: `risk:${totals.critical + totals.high + totals.moderate + totals.low}`,
  });
});

const schedulePlugin = toPluginDefinition<'plugin:policy-scheduler', OrchestrationPlanOutput, OrchestrationPlanOutput>({
  ...(rawSeeds[2] as PluginSeed),
  name: 'plugin:policy-scheduler',
}, async (plan: OrchestrationPlanOutput) => {
  const directives = plan.directives.slice(0, 4).map((directive, index) => ({
    ...directive,
    weight: Number((directive.weight + index * 0.1).toFixed(3)),
  }));

  return successResult({
    runId: plan.runId,
    directives,
    artifacts: [
      {
        tenant: tenantId('tenant-omega'),
        runId: plan.runId,
        createdAt: new Date().toISOString(),
        checksums: { scheduleSignature: directives.map((entry) => entry.name).join('>') },
      },
    ],
    summary: `scheduled:${directives.length}`,
  });
});

export const pluginCatalog = asReadonlyTuple([normalizePlugin, riskPlugin, schedulePlugin] as const);

export const loadPlugins = () => new PluginRegistry<typeof pluginCatalog>(pluginCatalog);

export const resolveExecutionPlan = (): readonly PluginName[] => {
  const registry = loadPlugins();
  return registry.names();
};

export const buildDemoContext = (tenant: string, planId: string) => ({
  tenant: tenantId(tenant),
  runId: runPlanId(planId),
  commandId: randomUUID() as string,
  timestamp: new Date().toISOString(),
});

export const bootstrapPlugins = {
  registry: loadPlugins(),
  order: resolveExecutionPlan(),
};
