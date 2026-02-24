import {
  type BuildPolicySummary,
  ContinuityPolicy,
  ContinuityRunContext,
  type ContinuityRunToken,
  type ContinuityTemplate,
  type EventChannel,
  type EventName,
  type ContinuityTemplateId,
} from './types';
import { evaluateBudget, evaluatePolicy, validateRun } from './policies';

type PluginName = 'anomaly' | 'budget' | 'safety';

type PluginContract = {
  anomaly: {
    plugin: 'anomaly';
    input: { template: ContinuityTemplate; reason: string };
    output: Omit<BuildPolicySummary, 'riskBand'> & { reasons: readonly string[] };
  };
  budget: {
    plugin: 'budget';
    input: { template: ContinuityTemplate };
    output: { templateId: ContinuityTemplateId; ok: boolean; risk: ContinuityPolicy };
  };
  safety: {
    plugin: 'safety';
    input: { template: ContinuityTemplate; token: ContinuityRunToken };
    output: { allowed: boolean; risk: ContinuityPolicy; channel: EventChannel<string> };
  };
};

export type PluginInput<K extends PluginName = PluginName> = PluginContract[K]['input'];
export type PluginOutput<K extends PluginName = PluginName> = PluginContract[K]['output'];

export type PluginInstance<TPlugin extends PluginName = PluginName> = {
  readonly plugin: TPlugin;
  readonly priority: number;
  readonly version: string;
  readonly run: (input: PluginInput<TPlugin>) => Promise<PluginOutput<TPlugin>> | PluginOutput<TPlugin>;
};

export interface ContinuityPluginState {
  readonly templateId: ContinuityTemplateId;
  readonly nodeCount: number;
  readonly eventNames: readonly EventName<string>[];
}

export class ContinuityPluginRegistry {
  private readonly map = new Map<PluginName, ReadonlyArray<PluginInstance<PluginName>>>();

  register<K extends PluginName>(kind: K, plugin: PluginInstance<K>): void {
    const current = this.map.get(kind) ?? [];
    this.map.set(kind, [...current, plugin as unknown as PluginInstance<PluginName>]);
  }

  get(kind: PluginName): readonly PluginInstance[] {
    return this.map.get(kind) ?? [];
  }

  async run<K extends PluginName>(kind: K, input: PluginInput<K>): Promise<PluginOutput<K>[]> {
    const plugins = this.get(kind);
    const executed = await Promise.all(
      plugins.map(async (plugin) => {
        if (plugin.plugin === 'anomaly') {
          const result = await plugin.run(input as PluginInput<'anomaly'>);
          return result as PluginOutput<K>;
        }
        if (plugin.plugin === 'budget') {
          const result = await plugin.run(input as PluginInput<'budget'>);
          return result as PluginOutput<K>;
        }
        const result = await plugin.run(input as PluginInput<'safety'>);
        return result as PluginOutput<K>;
      }),
    );
    return executed as PluginOutput<K>[];
  }

  async runPolicyChain(template: ContinuityTemplate, token: ContinuityRunToken): Promise<readonly ContinuityPolicy[]> {
    const outcomes = await this.run('safety', { template, token });
    return outcomes.map((value) => value.risk);
  }

  async runAnomalyChain(template: ContinuityTemplate): Promise<readonly (Omit<BuildPolicySummary, 'riskBand'> & { reasons: readonly string[] })[]> {
    return this.run('anomaly', {
      template,
      reason: template.scope.region,
    });
  }

  async runBudgetChain(template: ContinuityTemplate): Promise<readonly { templateId: ContinuityTemplateId; ok: boolean; risk: ContinuityPolicy }[]> {
    return this.run('budget', { template });
  }

  static baselinePolicy(template: ContinuityTemplate): ContinuityPolicy {
    return template.policy;
  }

  *[Symbol.iterator](): IterableIterator<[PluginName, readonly PluginInstance[]]> {
    for (const entry of this.map.entries()) {
      yield [entry[0], entry[1]];
    }
  }

  stateFromTemplate<K extends PluginName>(kind: K, template: ContinuityTemplate): ContinuityPluginState {
    return {
      templateId: template.id,
      nodeCount: template.nodes.length,
      eventNames: this.get(kind).map((_, index) => `continuity:${template.id}:${index}` as EventName<string>),
    };
  }
}

export const bootstrapPluginChain = async (): Promise<ContinuityPluginRegistry> => {
  const registry = new ContinuityPluginRegistry();

  registry.register('safety', {
    plugin: 'safety',
    priority: 10,
    version: '1.0.0',
    run: (input: PluginInput<'safety'>) => {
      const { template, token } = input;
      const report = evaluatePolicy(template);
      const validated = validateRun(
        {
          runId: token,
          templateId: template.id,
          tenant: template.tenant,
          eventChannel: `tenant:${template.tenant}.${template.windowHint}`,
          tags: template.tags,
        },
        {
          nodeId: template.nodes[0]?.id ?? template.id,
          output: { template: String(template.id), reasons: [...report.reasons] },
          success: report.allowed,
          diagnostics: ['registry.safety'],
        },
      );

      return {
        allowed: validated.allowed,
        risk: template.policy,
        channel: `tenant:${template.tenant}.${template.windowHint}`,
      };
    },
  });

  registry.register('anomaly', {
    plugin: 'anomaly',
    priority: 20,
    version: '1.0.0',
    run: (input: PluginInput<'anomaly'>) => {
      const { template, reason } = input;
      const budget = evaluateBudget(template);
      const score = Math.max(0, 1 - budget.maxLatencyMs / 1_000);
      return {
        allowed: budget.maxParallelism > 0,
        score,
        reasons: [
          `reason=${reason}`,
          `parallelism=${budget.maxParallelism}`,
          `latency=${budget.maxLatencyMs}`,
        ],
      };
    },
  });

  registry.register('budget', {
    plugin: 'budget',
    priority: 30,
    version: '1.0.0',
    run: (input: PluginInput<'budget'>) => {
      const { template } = input;
      return {
      templateId: template.id,
      ok: template.policy.enforceSla,
      risk: template.policy,
      };
    },
  });

  return registry;
};

export const scorePluginOutput = (scores: readonly number[]): number => {
  const total = scores.reduce((acc, score) => acc + score, 0);
  return total / Math.max(1, scores.length);
};

export const mapPluginStateToAudit = (state: ContinuityPluginState): Readonly<Record<string, string>> => ({
  templateId: String(state.templateId),
  nodeCount: String(state.nodeCount),
  eventCount: String(state.eventNames.length),
});

export const validateContext = (context: ContinuityRunContext): boolean => {
  const parsed = context.eventChannel.split('.');
  const names = parsed.flatMap((part) => part.split(':'));
  return context.tags.length > 0 && context.tenant.length > 0 && names.length > 0;
};

export const applyContextValidation = (context: ContinuityRunContext): BuildPolicySummary => {
  const valid = validateContext(context);
  const reasons = valid ? ['context-valid'] : ['context-invalid'];
  const score = valid ? 0.8 : 0.3;
  return {
    allowed: valid,
    reasons,
    score,
    riskBand: score > 0.7 ? 'low' : 'medium',
  };
};
