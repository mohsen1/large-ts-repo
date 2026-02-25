import { withBrand } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';
import {
  normalizeScopes,
  tenantId,
  runId,
  sessionId,
  toObservabilityContext,
  observabilityDefaults,
  type ObservabilityScope,
  type ObservabilityTenantId,
  type ObservabilityRunId,
  type ObservabilitySessionId,
  type ObservabilityPlaybookId,
  playbookId,
} from '@domain/recovery-playbook-observability-core';
import {
  ObservabilityTopology,
  buildTopologyDigest,
  type GraphNodeId,
  type GraphKind,
} from '@domain/recovery-playbook-observability-core';
import {
  defaultPluginDefinitions,
  PlaybookObservabilityPluginRegistry,
  type PlaybookObservabilityPlugin,
  type PlaybookRuntimeMetrics,
  type ObservabilityMetricRecord,
  type TelemetryManifest,
} from '@domain/recovery-playbook-observability-core';
import {
  defaultObservabilityPolicy,
  type ObservabilityRuntimePolicy,
} from './policy';
import {
  ObservabilityExecutionBuffer,
  type ExecutionSnapshot,
} from './execution';

export interface OrchestratorInput {
  readonly tenantId?: string;
  readonly playbook?: string;
  readonly scopes?: readonly ObservabilityScope[];
  readonly plugins?: readonly PlaybookObservabilityPlugin<string, any, any>[];
  readonly policy?: Partial<ObservabilityRuntimePolicy>;
}

type AsyncStackCtor = {
  new (): AsyncDisposableStack;
} | undefined;

export interface OrchestrationSessionResult {
  readonly runId: ObservabilityRunId;
  readonly sessionId: ObservabilitySessionId;
  readonly topologyDigest: string;
  readonly score: number;
  readonly drift: number;
  readonly manifest: TelemetryManifest;
  readonly eventCount: number;
}

const resolveStackCtor = (): AsyncStackCtor =>
  (globalThis as { AsyncDisposableStack?: { new (): AsyncDisposableStack } }).AsyncDisposableStack;

const summarize = (snapshot: ExecutionSnapshot): { readonly score: number; readonly drift: number } => snapshot.window;

const nodeId = (runId: ObservabilityRunId, scope: ObservabilityScope, role: string): GraphNodeId<ObservabilityScope> =>
  `${scope}:${runId}:${role}` as GraphNodeId<ObservabilityScope>;

const severity = (index: number): 0 | 1 | 2 | 3 | 4 | 5 => (index % 6) as 0 | 1 | 2 | 3 | 4 | 5;

const buildTopology = (
  runIdValue: ObservabilityRunId,
  policy: ObservabilityRuntimePolicy,
  scopes: readonly ObservabilityScope[],
  playbook: ObservabilityPlaybookId,
): ObservabilityTopology => {
  const topology = new ObservabilityTopology();
  const chain = scopes.length > 0 ? scopes : policy.allowedScopes;

  for (const [index, scope] of chain.entries()) {
    topology.addNode({
      id: nodeId(runIdValue, scope, `chain-${index}`),
      playbookId: playbook,
      scope,
      kind: 'timeline',
      label: `${scope}::${index}`,
      tags: ['seed', 'playbook-observability', scope],
      createdAt: new Date().toISOString(),
      state: {
        stateful: true,
        severity: severity(index),
        score: 1 - index * 0.08,
      },
    });

    if (index > 0) {
      const previous = chain[index - 1];
      topology.addEdge({
        from: nodeId(runIdValue, previous, `chain-${index - 1}`),
        to: nodeId(runIdValue, scope, `chain-${index}`),
        kind: 'dependency',
        weight: 1 + index,
        reason: `chain:${previous}->${scope}`,
      });
    }
  }

  for (const anchor of chain.slice(-2)) {
    topology.addEdge({
      from: nodeId(runIdValue, chain[0], 'chain-0'),
      to: nodeId(runIdValue, anchor, `chain-${chain.lastIndexOf(anchor)}`),
      kind: 'timeline' as GraphKind,
      weight: 2,
      reason: `route:${anchor}`,
    });
  }

  topology.addNode({
    id: nodeId(runIdValue, chain[chain.length - 1], 'signal-leaf'),
    playbookId: playbook,
    scope: chain[chain.length - 1],
    kind: 'incident',
    label: 'signal-leaf',
    tags: ['sink'],
    createdAt: new Date().toISOString(),
    state: {
      stateful: true,
      severity: 5,
      score: 0.9,
    },
  });

  return topology;
};

const policySeed = (policy: Partial<ObservabilityRuntimePolicy>): ObservabilityRuntimePolicy => {
  const defaults = {
    ...observabilityDefaults.policy,
    ...policy,
    enableForecast: policy.enableForecast ?? defaultObservabilityPolicy.enableForecast,
    topologicalDepth: policy.topologicalDepth ?? defaultObservabilityPolicy.topologicalDepth,
    pluginWeightDecay: policy.pluginWeightDecay ?? defaultObservabilityPolicy.pluginWeightDecay,
  } satisfies ObservabilityRuntimePolicy;
  return defaults;
};

const createMetricRecords = (
  tenant: ObservabilityTenantId,
  playbook: ObservabilityPlaybookId,
  runIdValue: ObservabilityRunId,
  scope: ObservabilityScope,
  policy: ObservabilityRuntimePolicy,
): readonly ObservabilityMetricRecord[] =>
  Array.from({ length: policy.topologicalDepth }, (_, index) => ({
    metricId: withBrand(`metric:${runIdValue}:${scope}:${index}`, 'ObservabilityMetricId'),
    tenantId: tenant,
    playbookId: playbook,
    name: `policy:${scope}:metric:${index}`,
    scope,
    value: policy.maxEventSpan / (index + 1),
    unit: 'count',
    path: `metric.${scope}.${index}`,
    emittedAt: new Date().toISOString(),
  }));

const indexSafe = (value: number): number => (Number.isFinite(value) ? value : 0);

const createForecasts = (
  policy: ObservabilityRuntimePolicy,
  scope: ObservabilityScope,
): readonly PlaybookRuntimeMetrics[] =>
  Array.from({ length: policy.topologicalDepth }, (_, index) => ({
    scope,
    score: policy.maxEventSpan / (index + 1),
    drift: Number(indexSafe(index) / 100),
    variance: index * 0.5,
    confidence: Math.min(1, policy.pluginWeightDecay + index * 0.01),
    trend: index % 3 === 0 ? 'increasing' : index % 3 === 1 ? 'decreasing' : 'steady',
  }));

export class PlaybookObservabilityOrchestrator {
  readonly #policy: ObservabilityRuntimePolicy;
  readonly #plugins: readonly PlaybookObservabilityPlugin<string, any, any>[];
  readonly #seedTenantId: string;
  readonly #seedPlaybook: string;

  constructor(input: OrchestratorInput = {}) {
    this.#policy = policySeed(input.policy ?? {});
    this.#plugins = input.plugins ?? defaultPluginDefinitions();
    this.#seedTenantId = input.tenantId ?? 'tenant:local';
    this.#seedPlaybook = input.playbook ?? 'playbook-local';
  }

  async run(input: OrchestratorInput = {}): Promise<Result<OrchestrationSessionResult, string>> {
    const policy = {
      ...this.#policy,
      ...input.policy,
    };
    const tenantIdValue = input.tenantId ?? this.#seedTenantId;
    const playbook = input.playbook ?? this.#seedPlaybook;
    if (tenantIdValue.length === 0 || playbook.length === 0) {
      return fail('missing-tenant-or-playbook');
    }

    const tenant = tenantId(tenantIdValue);
    const resolvedScopes = normalizeScopes(input.scopes ?? policy.allowedScopes);
    const scope = resolvedScopes[0] ?? policy.allowedScopes[0];
    const runIdValue = runId(tenant, policy.topologicalDepth + 1);
    const topology = buildTopology(
      runIdValue,
      policy,
      resolvedScopes,
      playbookId(tenantIdValue, `playbook-observability:${scope}`),
    );
    const sessionIdValue = sessionId(tenant, runIdValue);

    const context = toObservabilityContext({
      tenantIdValue,
      playbook,
      run: String(runIdValue),
      scopes: [scope] as const,
      stage: 'observed',
      tagSeed: 'orchestrator',
    });

    const registry = new PlaybookObservabilityPluginRegistry(this.#plugins as never);

    const stackCtor = resolveStackCtor();
    if (stackCtor) {
      await using stack = new stackCtor();
      return await this.#execute(
        { playbookId: context.playbookId, scope },
        tenant,
        runIdValue,
        sessionIdValue,
        scope,
        policy,
        topology,
        registry,
      );
    }

    return this.#execute(
      { playbookId: context.playbookId, scope },
      tenant,
      runIdValue,
      sessionIdValue,
      scope,
      policy,
      topology,
      registry,
    );
  }

  async #execute(
    context: {
      readonly playbookId: ObservabilityPlaybookId;
      readonly scope: ObservabilityScope;
    },
    tenant: ObservabilityTenantId,
    runIdValue: ObservabilityRunId,
    sessionIdValue: ObservabilitySessionId,
    scope: ObservabilityScope,
    policy: ObservabilityRuntimePolicy,
    topology: ObservabilityTopology,
    registry: PlaybookObservabilityPluginRegistry<readonly PlaybookObservabilityPlugin<string, any, any>[]>,
  ): Promise<Result<OrchestrationSessionResult, string>> {
    const buffer = new ObservabilityExecutionBuffer(registry, {
      runId: runIdValue,
      tenantId: tenant,
      sessionId: sessionIdValue,
      playbookId: context.playbookId,
      scope,
      startedAt: new Date().toISOString(),
    });

    const metrics = createMetricRecords(
      tenant,
      context.playbookId,
      runIdValue,
      scope,
      policy,
    );
    const forecasts = createForecasts(policy, scope);

    const signal = withBrand(`signal:${runIdValue}`, 'ObservabilitySignalId');
    const signalResult = await buffer.appendSignal(signal);
    if (!signalResult.ok) {
      await buffer.cleanup();
      return fail(signalResult.error);
    }

    const metricResults = await Promise.all(
      metrics.map(async (metric) => await buffer.appendMetric(metric)),
    );
    const firstMetricFailure = metricResults.find((result) => !result.ok);
    if (firstMetricFailure && !firstMetricFailure.ok) {
      await buffer.cleanup();
      return fail(firstMetricFailure.error);
    }

    const forecastResults = await Promise.all(
      forecasts.map(async (forecast) => await buffer.appendForecast(forecast)),
    );
    const firstForecastFailure = forecastResults.find((result) => !result.ok);
    if (firstForecastFailure && !firstForecastFailure.ok) {
      await buffer.cleanup();
      return fail(firstForecastFailure.error);
    }

    const alert = await buffer.appendAlert(`run:${runIdValue}:policy-${policy.name}`);
    if (!alert.ok) {
      await buffer.cleanup();
      return fail(alert.error);
    }

    const drained = await buffer.drain();
    if (!drained.ok) {
      await buffer.cleanup();
      return fail(drained.error);
    }

    const [manifest] = [drained.value.manifest];
    const { score, drift } = summarize(drained.value);

    return ok({
      runId: runIdValue,
      sessionId: sessionIdValue,
      topologyDigest: buildTopologyDigest(topology),
      score,
      drift,
      manifest,
      eventCount: manifest.timeline.length + manifest.bucketCount,
    });
  }
}

export const runObservabilityScenario = async (
  input: OrchestratorInput,
): Promise<Result<OrchestrationSessionResult, string>> => {
  const orchestrator = new PlaybookObservabilityOrchestrator();
  return orchestrator.run(input);
};
