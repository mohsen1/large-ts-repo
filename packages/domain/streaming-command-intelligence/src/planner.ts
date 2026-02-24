import { NoInfer, Prettify } from '@shared/type-level';
import {
  asCommandPolicyId,
  asCommandPlanId,
  asCommandEnvelopeId,
  asCommandStepId,
  asCommandTag,
  asCommandTraceId,
  asSignalBus,
  CommandExecutionContext,
  CommandNamespace,
  CommandPolicy,
  CommandPlan,
  CommandPlanId,
  CommandPolicyByPriority,
  CommandPolicyConstraint,
  CommandPlanStepDescriptor,
  CommandRunContext,
  CommandRunResult,
  CommandScore,
  CommandSignalRecord,
  commandNamespaces,
  CommandTenantId,
  StreamCommandPluginId,
  StepDescriptorTuple,
} from './types';
import { StreamId } from '@domain/streaming-engine';

type PlanTopology = {
  readonly nodes: readonly string[];
  readonly edges: readonly [string, string, number][];
};

type RawPluginSeed = {
  readonly name: string;
  readonly namespace: CommandNamespace;
  readonly stepId: string;
  readonly latencyBudgetMs: number;
};

interface CommandPlannerOptions {
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly defaultDurationMs: number;
  readonly labels: Readonly<Record<string, string>>;
  readonly policy: CommandPolicy;
}

interface PlannerSnapshot {
  readonly planId: CommandPlanId;
  readonly constraints: readonly CommandPolicyConstraint[];
  readonly plugins: readonly string[];
  readonly planDurationMs: number;
}

export type PlannerConstraint = {
  readonly namespace: CommandNamespace;
  readonly required: boolean;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly severity: CommandPolicyByPriority<number>;
};

const hashTopology = (topology: PlanTopology): string => {
  const nodes = [...topology.nodes].sort().join('|');
  const edges = [...topology.edges]
    .map((edge) => `${edge[0]}->${edge[1]}@${edge[2]}`)
    .sort()
    .join('|');
  return `${nodes}||${edges}`;
};

const toStepNamespace = (index: number, policy: CommandPolicy): CommandNamespace =>
  policy.allowedNamespaces[index % policy.allowedNamespaces.length] ?? 'ingest';

const normalizeConstraintKey = (constraint: { namespace: string; required: boolean }): `${string}:${string}` =>
  `${constraint.namespace}:${constraint.required ? 'required' : 'optional'}`;

export interface CommandPlanBlueprint<TLabels extends Record<string, string> = Record<string, string>> {
  readonly name: string;
  readonly labels: TLabels;
  readonly topologySignature: string;
}

export const resolvePlanSteps = <TSteps extends readonly string[]>(
  steps: TSteps,
): Prettify<StepDescriptorTuple<TSteps>> => {
  const baselinePolicy = {
    id: asCommandPolicyId('planner:internal'),
    name: 'internal',
    priority: 2,
    tags: [],
    allowedNamespaces: [...commandNamespaces],
    requires: [],
    emits: [],
    metadata: {},
  };
  return steps.map((step, index) => ({
    index,
    step,
    namespace: toStepNamespace(index, baselinePolicy),
    stepId: asCommandStepId(`planner:${index}`),
  })) as Prettify<StepDescriptorTuple<TSteps>>;
};

const inferTemplatePolicy = (value: number): CommandPolicyByPriority<number> => {
  if (value <= 2) return 'minimal';
  if (value <= 4) return 'normal';
  return 'aggressive';
};

const makePluginId = (
  tenantId: CommandTenantId,
  planId: CommandPlanId,
  index: number,
  namespace: CommandNamespace,
): StreamCommandPluginId =>
  `${tenantId}:${planId}:${namespace}:${index}` as StreamCommandPluginId;

export class CommandPlanner {
  private readonly constraints = new Map<string, CommandPolicyConstraint>();
  private topology: PlanTopology = { nodes: [], edges: [] };

  public constructor(private readonly options: CommandPlannerOptions) {}

  public withTopology(topology: PlanTopology): this {
    this.topology = {
      nodes: [...topology.nodes],
      edges: [...topology.edges],
    };
    return this;
  }

  public addConstraint<const TNamespace extends CommandNamespace>(constraint: {
    namespace: TNamespace;
    required: boolean;
    payload: Readonly<Record<string, unknown>>;
  }): this {
    const normalized: CommandPolicyConstraint = {
      namespace: constraint.namespace,
      policyId: asCommandPolicyId(`${this.options.tenantId}:${this.options.streamId}:constraints`),
      required: constraint.required,
      payload: constraint.payload,
      weight: 1,
      severity: inferTemplatePolicy(this.options.policy.priority),
    };

    this.constraints.set(normalizeConstraintKey(normalized), normalized);
    return this;
  }

  public build<const TSteps extends readonly string[]>(
    steps: NoInfer<TSteps>,
    pluginTemplates?: readonly RawPluginSeed[],
  ): CommandPlan {
    const now = new Date().toISOString();
    const constraints = [...this.constraints.values()];
    const planId = asCommandPlanId(
      `${this.options.streamId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    );
    const selectedTemplate = pluginTemplates ?? steps.map((name, index) => ({
      name,
      namespace: toStepNamespace(index, this.options.policy),
      stepId: `${planId}:${index}`,
      latencyBudgetMs: 150 + index * 50,
    }));

    const plugins = selectedTemplate.map((seed, index) => {
      const namespace = seed.namespace ?? toStepNamespace(index, this.options.policy);
      return {
        pluginId: makePluginId(this.options.tenantId, planId, index, namespace),
        name: seed.name,
        kind: `${namespace}-plugin` as CommandPlanStepDescriptor['kind'],
        namespace,
        version: '1.0.0',
        consumes: [asCommandTag(`signal:${seed.stepId}`)],
        emits: [asSignalBus(`plugin.${seed.name}`), asSignalBus('commands')],
        config: {
          seed: seed.name,
          index,
          generatedBy: 'planner',
          policyPriority: this.options.policy.priority,
          createdAt: now,
        },
        input: {},
        output: {},
        stepId: asCommandStepId(`${planId}:${seed.stepId}`),
        behavior: 'augment' as CommandPlanStepDescriptor['behavior'],
        latencyBudgetMs: Math.max(seed.latencyBudgetMs, 50),
      } as CommandPlanStepDescriptor;
    });

    return {
      planId,
      name: `${this.options.streamId}-plan-${steps.length}`,
      tenantId: this.options.tenantId,
      streamId: this.options.streamId,
      plugins,
      expectedDurationMs: Math.max(this.options.defaultDurationMs, plugins.length * 180),
      labels: {
        ...this.options.labels,
        generatedAt: now,
        topology: hashTopology(this.topology),
        constraints: constraints.map((constraint) => normalizeConstraintKey(constraint)).join('|'),
        policy: this.options.policy.name,
      },
      config: {
        policyId: this.options.policy.id,
        constraints,
        pluginCatalog: plugins.length,
        steps: [...steps],
      },
    };
  }

  public normalize(plan: CommandPlan): CommandRunContext {
    return {
      tenantId: plan.tenantId,
      streamId: plan.streamId,
      planId: plan.planId,
      status: 'running',
      startedAt: new Date().toISOString(),
      commandCount: plan.plugins.length,
    };
  }

  public describe(plan: CommandPlan): string {
    const names = plan.plugins.map((plugin) => plugin.name);
    return `${plan.name} :: ${names.join(' -> ')} :: expected=${plan.expectedDurationMs}ms`;
  }

  public blueprint(): CommandPlanBlueprint<Record<string, string>> {
    return {
      name: `${this.options.streamId}-${this.options.policy.name}`,
      labels: {
        tenantId: String(this.options.tenantId),
        streamId: String(this.options.streamId),
        ...this.options.labels,
      },
      topologySignature: hashTopology(this.topology),
    };
  }

  public constraintsAsString(): string {
    return [...this.constraints.entries()]
      .map(([key, constraint]) => `${key}:${String(constraint.severity)}`)
      .join(',');
  }

  public snapshot(): PlannerSnapshot {
    return {
      planId: asCommandPlanId(`${this.options.streamId}:snapshot:${Date.now()}`),
      constraints: [...this.constraints.values()],
      plugins: [...this.options.policy.allowedNamespaces],
      planDurationMs: this.options.defaultDurationMs,
    };
  }
}

export const normalizePlanContext = <TPlan extends CommandPlan>(
  plan: TPlan,
  overrides: Partial<Pick<CommandPlannerOptions, 'tenantId' | 'labels'>> = {},
): CommandRunContext => ({
  tenantId: overrides.tenantId ?? plan.tenantId,
  streamId: plan.streamId,
  planId: plan.planId,
  status: 'running',
  startedAt: new Date().toISOString(),
  commandCount: plan.plugins.length,
});

export const scoreFromEnvelopes = (warnings: readonly string[]): CommandScore => ({
  score: Math.max(0, Math.min(1, 1 - warnings.length * 0.1)),
  confidence: Math.min(1, 0.5 + 0.05 * Math.max(0, 20 - warnings.length)),
  severity: (warnings.length >= 5 ? 5 : warnings.length >= 3 ? 3 : 1) as 1 | 2 | 3 | 4 | 5,
});

export interface PlanExecutionEnvelope {
  readonly pluginId: StreamCommandPluginId;
  readonly pluginName: string;
  readonly output: unknown;
  readonly latencyMs: number;
}

export const executePlanWithRegistry = async <TSeed, TOutput>(
  plan: CommandPlan,
  registry: {
    runPlan<TSeedValue, TOutputValue>(
      currentPlan: CommandPlan,
      seed: TSeedValue,
      context: Omit<CommandExecutionContext, 'attempt'>,
    ): Promise<CommandRunResult<TOutputValue>>;
  },
  seed: NoInfer<TSeed>,
): Promise<CommandRunResult<TOutput>> => {
  const context: Omit<CommandExecutionContext, 'attempt'> = {
    tenantId: plan.tenantId,
    streamId: plan.streamId,
    traceId: asCommandTraceId(`trace:${plan.planId}:${Date.now()}`),
    runId: plan.planId,
    pluginName: plan.name,
    startedAt: new Date().toISOString(),
  };

  const result = await registry.runPlan(plan, seed, context);
  return result as CommandRunResult<TOutput>;
};

export const planSignalEnvelopeContext = (plan: CommandPlan): CommandSignalRecord[] =>
  plan.plugins.map((plugin, index) => ({
    envelopeId: asCommandEnvelopeId(`${plan.planId}:${index}`),
    tenantId: plan.tenantId,
    streamId: plan.streamId,
    namespace: plugin.namespace,
    payload: {
      pluginKind: plugin.kind,
      pluginId: plugin.pluginId,
      latencyBudgetMs: plugin.latencyBudgetMs,
    },
    context: [plugin.pluginId, plugin.name, plugin.stepId],
  }));
