import {
  AdaptivePolicy,
  AdaptiveDecision,
  AdaptiveAction,
  SignalKind,
  SignalSample,
  asIncidentId,
  asPolicyId,
  asRunId,
} from './types';
import {
  PluginRegistry,
  PluginKind,
  PluginDefinition,
  PluginContext,
  PluginResult,
  PluginVersion,
  pluginKinds,
  PluginId,
} from './plugin-registry';
import {
  buildDecisionTrace,
  DecisionTrace,
  toFixedTuple,
  PolicySignalGraph,
  createTenantToken,
} from './advanced-types';
import { createAsyncScope, wrapDisposable } from './async-lifecycle';

const pluginTemplates = [
  {
    kind: 'ingest' as const,
    id: 'plugin:ingest:primary',
    name: 'primary-ingest',
    version: '1.1.0',
    accepts: ['manual-flag', 'availability'],
    stages: ['ingest'],
    config: { enabled: true, weight: 1.0 },
  },
  {
    kind: 'transform' as const,
    id: 'plugin:transform:policy-router',
    name: 'policy-router',
    version: '1.2.0',
    accepts: ['error-rate', 'latency'],
    stages: ['transform'],
    config: { enabled: true, weight: 1.1 },
  },
  {
    kind: 'evaluate' as const,
    id: 'plugin:evaluate:risk-scorer',
    name: 'risk-scorer',
    version: '2.0.0',
    accepts: ['cost-variance', 'error-rate'],
    stages: ['evaluate'],
    config: { minRisk: 0.2, maxRisk: 0.8 },
  },
  {
    kind: 'simulate' as const,
    id: 'plugin:simulate:what-if',
    name: 'what-if-simulator',
    version: '0.9.0',
    accepts: ['manual-flag', 'latency', 'availability'],
    stages: ['simulate'],
    config: { enabled: true, rounds: 3 },
  },
  {
    kind: 'commit' as const,
    id: 'plugin:commit:committer',
    name: 'committer',
    version: '1.0.2',
    accepts: ['manual-flag'],
    stages: ['commit'],
    config: { enableDryRun: true, maxRisk: 'medium' },
  },
];

const pluginDefinitions: readonly PluginDefinition<PluginKind, unknown>[] = pluginTemplates.map((template) => ({
  kind: template.kind,
  id: template.id as PluginId<PluginKind>,
  name: template.name,
  version: template.version as PluginVersion,
  accepts: template.accepts as readonly SignalKind[],
  stages: template.stages as readonly PluginKind[],
  config: template.config,
  run: async (context: PluginContext<unknown>) => {
    const signalRatio = context.signals.length
      ? context.signals.filter((signal) => template.accepts.includes(signal.kind)).length / context.signals.length
      : 0;
    return {
      pluginId: context.traceId,
      kind: context.stage,
      accepted: signalRatio > 0 || context.policies.length > 0,
      score: Math.min(1, signalRatio + context.decisions.length * 0.1),
      warnings: signalRatio === 0 ? ['no matching signals'] : [],
      tags: [template.name, context.stage],
    };
  },
}));

export type BuiltinPluginDefinition = (typeof pluginDefinitions)[number];

type PluginOutputSummary = {
  accepted: number;
  rejected: number;
  riskSignals: readonly string[];
  warnings: readonly string[];
};

export type PlaybookRunInput<TPolicies extends readonly AdaptivePolicy[], TSignals extends readonly SignalSample[]> = {
  tenantId: string;
  policies: TPolicies;
  signals: TSignals;
  preferredKinds: readonly SignalKind[];
  maxActionCount?: number;
  stageOrder?: readonly PluginKind[];
};

export interface PlaybookRuntimePolicyState {
  readonly policyId: string;
  readonly riskScore: number;
  readonly actionCount: number;
  readonly accepted: boolean;
}

export interface PlaybookRunOutcome {
  tenantId: string;
  runId: string;
  topPolicyId: string | null;
  policyStates: readonly PlaybookRuntimePolicyState[];
  decisions: readonly AdaptiveDecision[];
  actions: readonly AdaptiveAction[];
  traces: readonly DecisionTrace[];
  graph: PolicySignalGraph;
  pluginSummary: PluginOutputSummary;
}

const iterableMap = function* <T, U>(items: Iterable<T>, selector: (value: T) => U): IterableIterator<U> {
  for (const value of items) {
    yield selector(value);
  }
};

const toSortedSignals = (signals: readonly SignalSample[]) => [
  ...iterableMap(signals, (signal) => ({ ...signal })),
].sort((left, right) => right.value - left.value);

const flattenPluginResults = (results: readonly PluginResult[]) =>
  results.reduce(
    (acc, result) => {
      if (result.accepted) {
        acc.accepted += 1;
      } else {
        acc.rejected += 1;
      }
      acc.warnings.push(...result.warnings);
      acc.riskSignals.push(result.pluginId);
      return acc;
    },
    { accepted: 0, rejected: 0, warnings: [] as string[], riskSignals: [] as string[] },
  );

const dedupe = <T>(items: readonly T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const next = key(item);
    if (!seen.has(next)) {
      seen.add(next);
      output.push(item);
    }
  }
  return output;
};

const selectStageInput = (order: readonly PluginKind[], fallback: readonly PluginKind[]) =>
  order.length > 0 ? order : fallback;

export class AdaptivePlaybookRuntime {
  #registry: PluginRegistry<readonly BuiltinPluginDefinition[]>;

  constructor(
    private readonly tenantId: string,
    private readonly preferredKinds: readonly SignalKind[],
    plugins: readonly PluginDefinition<PluginKind, unknown>[] = pluginDefinitions,
    private readonly maxActionCount: number = 12,
  ) {
    this.#registry = PluginRegistry.create(plugins);
    this.#registry.registerAll(plugins);
    this.preferredKinds = dedupe(preferredKinds, (kind) => kind);
  }

  async execute<TPolicies extends readonly AdaptivePolicy[], TSignals extends readonly SignalSample[]>(
    input: PlaybookRunInput<TPolicies, TSignals>,
  ): Promise<PlaybookRunOutcome> {
    const sortedSignals = toSortedSignals(input.signals);
    const fixedSignals = toFixedTuple(sortedSignals);
    const trace = createTenantToken(input.tenantId);
    const scopeToken = scopedRunToken(input.tenantId, `${input.signals[0]?.kind ?? 'none'}`);
    const normalizedKinds = dedupe(input.preferredKinds, (kind) => kind).filter((kind) => Object.hasOwn(signalKindWeight, kind));

    const pluginOrder = selectStageInput(input.stageOrder ?? [], pluginKinds);
    const filtered = fixedSignals.filter((sample) => {
      if (normalizedKinds.length === 0) return true;
      return normalizedKinds.includes(sample.kind);
    });

    const decisions: AdaptiveDecision[] = [];
    const actions: AdaptiveAction[] = [];

    await createAsyncScope(`playbook:${input.tenantId}`, async (scope) => {
      const cleanup = wrapDisposable(`scope:${scopeToken}`, { tenantId: input.tenantId, runAt: Date.now() });
      scope.use(cleanup);

      for (const stage of pluginOrder) {
        const runContext = {
          tenantId: input.tenantId,
          policies: input.policies,
          decisions,
          actions,
          signals: filtered,
          input: { tenantId: input.tenantId, preferredKinds: normalizedKinds, maxActionCount: this.maxActionCount, stage },
          timestamp: new Date().toISOString(),
          traceId: scopeToken,
          stage,
        };

        const pluginResults = await this.#registry.runByKind(stage, runContext);
        const summary = flattenPluginResults(pluginResults);
        if (summary.accepted === 0) {
          continue;
        }

        const nextActions = this.deriveActions(input.policies, filtered, stage);
        actions.push(...nextActions.slice(0, this.maxActionCount));
      }
    });

    const ranked = [...input.policies].sort(
      (left, right) =>
        (right.driftProfile?.tolerance ?? 0) - (left.driftProfile?.tolerance ?? 0),
    );
    const policyStates = ranked.slice(0, Math.max(1, Math.min(input.policies.length, 6))).map((policy, index) => ({
      policyId: `${policy.id}`,
      riskScore: index === 0 ? 0.98 : 0.35,
      actionCount: actions.filter((action) => action.targets.some((target) => `${target}`.length > 0)).length,
      accepted: index % 2 === 0,
    }));

    const decisionsSummary = policyStates.reduce<AdaptiveDecision[]>((acc, state) => {
      if (!state.accepted) return acc;
      const fakeDecision: AdaptiveDecision = {
        policyId: asPolicyId(state.policyId),
        incidentId: asIncidentId(`${input.tenantId}:${state.policyId}:run`),
        confidence: Math.min(1, state.riskScore),
        selectedActions: actions.filter((action) => action.targets.length > 0),
        risk: state.riskScore > 0.7 ? 'high' : 'low',
        runbook: {
          id: asRunId(`${input.tenantId}:${state.policyId}:book`),
          owner: 'playbook-runtime',
          strategy: actions,
          expectedRecoveryMinutes: Math.round(10 + state.actionCount),
          description: `Synthetic plan for ${state.policyId}`,
        },
      };
      return [...acc, fakeDecision];
    }, []);

    const pluginResults = await this.#registry.runAll({
      tenantId: input.tenantId,
      policies: input.policies,
      decisions,
      actions,
      signals: filtered,
      stage: 'commit',
      input: { policies: input.policies },
      timestamp: new Date().toISOString(),
      traceId: scopeToken,
    } as PluginContext<unknown>, input.policies.length);

    const summary = flattenPluginResults(pluginResults);
    const graph = buildDecisionTrace(
      { tenantId: input.tenantId, actionTargets: filtered, policyId: `${input.policies[0]?.id ?? 'none'}`, stage: 'execute' },
      decisionsSummary,
    );
    const policyId = decisionsSummary[0]?.policyId ?? null;

    return {
      tenantId: `${input.tenantId}`,
      runId: `${trace}` as unknown as string,
      topPolicyId: policyId,
      policyStates,
      decisions: decisionsSummary,
      actions,
      traces: graph.traces,
      graph,
      pluginSummary: {
        accepted: summary.accepted,
        rejected: summary.rejected,
        riskSignals: summary.riskSignals,
        warnings: summary.warnings,
      },
    };
  }

  private deriveActions(policies: readonly AdaptivePolicy[], signals: readonly SignalSample[], stage: PluginKind): AdaptiveAction[] {
    if (signals.length === 0) return [];
    const topSignal = signals.reduce((acc, signal) => (acc.value >= signal.value ? acc : signal), signals[0]);
    return policies.flatMap((policy, index) => {
      const intensity = Math.min(1, Math.max(0.05, topSignal.value / (index + 1 || 1)));
      return [
        {
          type: index % 5 === 0 ? 'scale-up' : index % 5 === 1 ? 'reroute' : index % 5 === 2 ? 'throttle' : index % 5 === 3 ? 'failover' : 'notify',
          intensity,
          targets: policy.dependencies.length > 0 ? [policy.dependencies[0].serviceId] : ['global' as never],
          justification: `${stage} derived action for ${policy.name}`,
        },
      ];
    });
  }
}

const scopedRunToken = (tenantId: string, fingerprint: unknown): string =>
  `${tenantId}:${String(fingerprint)}:${Date.now()}`;

const signalKindWeight: Record<SignalKind, number> = {
  'error-rate': 3,
  latency: 1.5,
  availability: 4,
  'cost-variance': 2,
  'manual-flag': 0.5,
};
