import {
  asHealthScore,
  asPolicyId,
  asTenantId,
  composeNamespace,
  type EcosystemPlan,
  type EcosystemPlugin,
  withDefaultPlan,
  type NamespaceTag,
  parseWorkspaceId,
  type RunId,
  type TenantId,
} from '@domain/recovery-ecosystem-core';
import {
  buildManifestIndex,
  PluginLattice,
  PluginLatticeTrace,
  pluginEventKinds,
  type PluginManifestEnvelope,
} from '@domain/recovery-ecosystem-core';
import {
  buildWorkspaceNodes,
  workspacePolicies,
  type WorkspaceBuildResult,
  type WorkspacePolicy,
  type WorkspaceSummary,
} from '@domain/recovery-ecosystem-core';
import { createInMemoryStore, type EcosystemSnapshot, type EcosystemStorePort } from '@data/recovery-ecosystem-store';
import { EcosystemQueryEngine, type QueryBatch } from '@data/recovery-ecosystem-store';
import { EcosystemMetricsCollector } from '@data/recovery-ecosystem-store';
import { fail, ok, type Result } from '@shared/result';
import { NoInfer } from '@shared/type-level';
import type { StageId, PolicyId } from '@domain/recovery-ecosystem-core';
import type { JsonValue } from '@shared/type-level';

type TopologyPolicyDefinition = {
  readonly id: PolicyId;
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: number;
  readonly tags: readonly `tag:${string}`[];
};

interface OrchestrationInput {
  readonly tenantId: string;
  readonly namespace: NamespaceTag;
  readonly policies: readonly string[];
}

interface TopologyNode {
  readonly id: string;
  readonly phase: string;
  readonly dependencyCount: number;
}

interface TopologySnapshot {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
}

export interface TopologyResult {
  readonly manifest: PluginManifestEnvelope<readonly EcosystemPlugin[]>;
  readonly topology: TopologySnapshot;
  readonly score: ReturnType<typeof asHealthScore>;
  readonly queryDigest: QueryBatch;
}

export interface PlanInput {
  readonly tenantId: string;
  readonly namespace: string;
  readonly activePolicies: readonly string[];
}

export interface PlanResult {
  readonly workspace: ReturnType<typeof parseWorkspaceId>;
  readonly policies: readonly WorkspacePolicy[];
  readonly summary: WorkspaceSummary;
  readonly plan: WorkspaceBuildResult;
}

const toPolicyPluginName = (policy: PolicyId): EcosystemPlugin['name'] =>
  `plugin:${policy.replace(/^policy:/, '')}` as EcosystemPlugin['name'];

const toWorkspacePolicies = (policies: readonly string[]): readonly TopologyPolicyDefinition[] =>
  workspacePolicies(policies.map((policy) => policy.replace(/^policy:/, ''))).map((policy) => ({
    ...policy,
    tags: policy.tags.length ? policy.tags : ['tag:topology-default'],
  }));

const dependencyFromPrevious = (
  policies: readonly PolicyId[],
  index: number,
): readonly EcosystemPlugin['name'][] => {
  if (index === 0) {
    return [];
  }
  const previous = policies[index - 1];
  return [toPolicyPluginName(previous)];
};

const buildPolicyPlugins = (namespace: NamespaceTag, policies: readonly TopologyPolicyDefinition[]): readonly EcosystemPlugin[] =>
  policies
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((policy, index, all) => {
      const pluginName = toPolicyPluginName(policy.id);
      const dependsOn = dependencyFromPrevious(
        all.map((entry) => asPolicyId(entry.id)),
        index,
      );

      const run: EcosystemPlugin['run'] = async (_input, context) => {
        const started = performance.now();
        const payload = {
          policy: String(policy.id),
          enabled: policy.enabled,
          runId: String(context.correlation.runId),
        };

        return {
          status: 'success',
          output: {
            output: {
              policy: payload,
              plugin: pluginName,
              timestamp: Date.now(),
            },
            summary: `policy:${policy.id}`,
            consumed: 1,
            produced: 1,
            artifacts: [`artifact:${pluginName}`],
          },
          logs: [`${pluginName}:executed`, `correlation:${String(context.correlation.runId)}`],
          message: `${pluginName}:executed`,
          elapsedMs: performance.now() - started,
          artifacts: [],
          skipped: false,
        };
      };

      return {
        name: pluginName,
        namespace,
        version: 'v1.0',
        dependsOn,
        description: `policy:${policy.id}`,
        tags: policy.tags,
        run,
        pluginFor: run,
      } satisfies EcosystemPlugin;
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));

const buildTopologyFromPlan = (plan: EcosystemPlan): TopologySnapshot => {
  const nodes = plan.phases.map((phase): TopologyNode => ({
    id: phase.id,
    phase: phase.name,
    dependencyCount: phase.dependsOn.length,
  }));

  const edges = plan.phases.flatMap((phase) =>
    phase.dependsOn.map((dependency) => ({
      from: dependency,
      to: phase.id,
    })),
  );

  return {
    nodes,
    edges,
  };
};

export class RecoveryEcosystemTopologyOrchestrator {
  readonly #store: EcosystemStorePort;
  readonly #queryEngine: EcosystemQueryEngine;
  readonly #metricsCollector: EcosystemMetricsCollector;

  public constructor(store: EcosystemStorePort = createInMemoryStore()) {
    this.#store = store;
    this.#queryEngine = new EcosystemQueryEngine(this.#store);
    this.#metricsCollector = new EcosystemMetricsCollector(this.#store);
  }

  public async topology(input: OrchestrationInput, plan: EcosystemPlan): Promise<Result<TopologyResult>> {
    const tenant = asTenantId(input.tenantId);
    const namespace = input.namespace;
    const policies = toWorkspacePolicies(input.policies);
    const pluginRuntime = PluginLattice.createPlan(buildPolicyPlugins(namespace, policies), namespace, tenant);
    const lattice = new PluginLattice(pluginRuntime, {
      enabled: pluginRuntime.order,
    });

    const manifest = buildManifestIndex(namespace, pluginRuntime.plugins);
    const topology = buildTopologyFromPlan(plan);
    const queryDigest = await this.#queryEngine.queryBatch(namespace, tenant, 50);
    const digestSeries = await this.#metricsCollector.digest(namespace);

    const score = asHealthScore(
      Math.max(1, (topology.nodes.length + digestSeries.metricCount + digestSeries.totalPoints) % 100),
    );

    await lattice.execute(
      tenant,
      `run:${Date.now()}` as RunId,
      {
        namespace,
        tenant,
        trace: [],
        input: {
          namespace,
          policies: policies.map((policy) => String(policy.id)),
          events: [...pluginEventKinds],
        } as Record<string, JsonValue>,
      },
    );

    await lattice[Symbol.asyncDispose]();

    return ok({
      manifest,
      topology,
      score,
      queryDigest,
    });
  }

  public async plans(input: PlanInput): Promise<Result<PlanResult>> {
    const namespace = composeNamespace(input.namespace);
    const workspace = parseWorkspaceId(input.namespace);
    const policyInput = toWorkspacePolicies(input.activePolicies);
    const defaultPlan = withDefaultPlan(asTenantId(input.tenantId), namespace);
    const plan = buildWorkspaceNodes(input.tenantId, input.namespace, defaultPlan, policyInput);

    if (plan.summary.policies.length === 0) {
      return fail(new Error('workspace-plan-empty'), 'topology');
    }

    return ok({
      workspace,
      policies: policyInput.map((policy) => ({
        ...policy,
        id: asPolicyId(policy.id),
        name: policy.name,
        enabled: true,
        weight: policy.weight,
        tags: policy.tags,
      })),
      summary: plan.summary,
      plan,
    });
  }

  public async runPluginTrace<TPlugins extends readonly EcosystemPlugin[]>(
    namespace: NamespaceTag,
    tenantId: string,
    plugins: NoInfer<TPlugins>,
  ): Promise<Result<readonly PluginLatticeTrace[]>> {
    const tenant = asTenantId(tenantId);
    const runtime = PluginLattice.createPlan(plugins, namespace, tenant);
    const lattice = new PluginLattice(runtime);
    const trace = await lattice.execute(
      tenant,
      `run:${Date.now()}` as RunId,
      {
        runId: `run:${Date.now()}` as RunId,
        tenant,
        namespace,
        trace: [],
        input: {
          namespace,
          policies: [],
          events: [...pluginEventKinds],
        },
      },
    );
    await lattice[Symbol.asyncDispose]();
    return ok(trace);
  }

  public async snapshot(
    namespace: NamespaceTag,
    tenantId: string,
  ): Promise<Result<readonly EcosystemSnapshot[]>> {
    const payload = await this.#queryEngine.querySnapshots(namespace, tenantId);
    if (payload.length === 0) {
      return fail(new Error('no-snapshots'), 'topology');
    }
    return ok(payload);
  }
}

export const createTopologyOrchestrator = (store?: EcosystemStorePort): RecoveryEcosystemTopologyOrchestrator =>
  new RecoveryEcosystemTopologyOrchestrator(store);
