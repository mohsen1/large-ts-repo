import {
  asPolicyId,
  asRunId,
  asHealthScore,
  composeNamespace,
  parseWorkspaceId,
  type NamespaceTag,
  type EcosystemPlan,
  type WorkspacePolicy,
  workspacePolicies,
  workspacePolicy,
  buildWorkspaceNodes,
  withDefaultPlan,
} from '@domain/recovery-ecosystem-core';
import {
  createTopologyOrchestrator,
  createTopologyObservabilityService,
  type TopologyResult,
  type PlanResult,
  type TopologyDigest,
} from '@service/recovery-ecosystem-orchestrator';
import { type EcosystemPlugin } from '@domain/recovery-ecosystem-core';
import { fail, ok, type Result } from '@shared/result';
import type { JsonValue } from '@shared/type-level';

const topologyOrchestrator = createTopologyOrchestrator();
const topologyObservability = createTopologyObservabilityService();

interface EventCollectorOptions {
  readonly namespace: string;
  readonly tenantId: string;
  readonly policies: readonly string[];
}

export interface EcosystemTopologyPolicyInput {
  readonly tenantId: string;
  readonly namespace: string;
  readonly activePolicies: readonly string[];
}

export const topologyDefaults = {
  namespace: 'namespace:recovery-ecosystem' as NamespaceTag,
  tenantId: 'tenant:default',
  activePolicies: ['policy:baseline', 'policy:observability', 'policy:forecast'],
} satisfies EcosystemTopologyPolicyInput;

const normalizeTenant = (tenantId: string): string =>
  tenantId.trim() || 'tenant:default';

const normalizePolicy = (policy: string): `policy:${string}` => asPolicyId(policy);

const toNamespaceTag = (namespace: string): NamespaceTag => {
  const normalized = namespace.replace(/^namespace:/, '').trim() || 'recovery-ecosystem';
  return composeNamespace('namespace', normalized) as NamespaceTag;
};

const normalizePolicies = (policies: readonly string[]): readonly string[] =>
  [...new Set(policies.map((policy) => policy.replace(/^policy:/, '')))]
    .map((policy) => `policy:${policy}`)
    .toSorted();

const buildPlanSeed = (tenantId: string, namespace: string, policies: readonly string[]): EcosystemPlan => {
  const normalized = normalizePolicies(policies);
  const tenant = normalizeTenant(tenantId);
  const base = withDefaultPlan(asPolicyId(tenant) as never as never, toNamespaceTag(namespace));
  const workspacePoliciesInput = workspacePolicies(normalized);
  const workspace = buildWorkspaceNodes(tenant, namespace, base, workspacePoliciesInput);

  return {
    ...base,
    policyIds: [...base.policyIds, ...workspace.summary.policies.map((policy) => policy.id)],
  } as EcosystemPlan;
};

const buildPlanSnapshot = (input: EventCollectorOptions): TopologyResult => {
  const namespace = toNamespaceTag(input.namespace);
  const policies = normalizePolicies(input.policies);
  const manifestEntries = policies.map((policy, index) => {
    const pluginName = `plugin:${policy.replace(/^policy:/, '')}` as EcosystemPlugin['name'];
    const previous = policies[index - 1];
    return [
      `manifest:${policy}` as const,
      {
        plugin: pluginName,
        namespace,
        dependencies:
          index === 0 ? [] : [`plugin:${previous?.replace(/^policy:/, '') ?? 'policy:seed'}` as EcosystemPlugin['name']],
        enabled: true,
      } as const,
    ] as const;
  });

  return {
    manifest: Object.fromEntries(manifestEntries) as TopologyResult['manifest'],
    topology: {
      nodes: policies.map((policy, index) => ({
        id: `node:${policy}`,
        phase: policy,
        dependencyCount: index % 3,
      })),
      edges: policies.toSorted().map((policy, index, all) => ({
        from: `node:${policy}`,
        to: all[index + 1] ? `node:${all[index + 1]}` : `node:${policy}`,
      })),
    },
    score: asHealthScore(88),
    queryDigest: {
      namespace,
      runCount: policies.length,
      eventCount: policies.length * 2,
      signatures: policies,
    },
  };
};

const buildWorkspacePolicies = (activePolicies: readonly string[]): readonly WorkspacePolicy[] => {
  const normalized = normalizePolicies(activePolicies);
  return normalized.map((policy) => workspacePolicy(policy.replace(/^policy:/, '')));
};

export const buildTopology = async (
  tenantId: string,
  namespace: string,
  policies: readonly string[] = topologyDefaults.activePolicies,
): Promise<Result<TopologyResult>> => {
  const namespaceTag = toNamespaceTag(namespace);
  const normalized = normalizePolicies(policies);
  const plan = buildPlanSeed(tenantId, namespace, normalized);

  return topologyOrchestrator.topology(
    {
      tenantId,
      namespace: namespaceTag,
      policies: normalized,
    },
    plan,
  );
};

export const buildPolicyPlan = async (input: EcosystemTopologyPolicyInput): Promise<Result<PlanResult>> => {
  const namespace = toNamespaceTag(input.namespace);
  const normalized = normalizePolicies(input.activePolicies);
  const result = await topologyOrchestrator.plans({
    tenantId: normalizeTenant(input.tenantId),
    namespace: namespace as unknown as string,
    activePolicies: normalized,
  });
  if (!result.ok) {
    return result;
  }

  return ok({
    ...result.value,
    policies: buildWorkspacePolicies(result.value.summary.policies.map((entry) => entry.id)),
  });
};

export const collectTopologyDigest = async (namespace: NamespaceTag): Promise<Result<TopologyDigest>> =>
  topologyObservability.digest(namespace);

export const loadTopologyTimeline = async (
  namespace: NamespaceTag,
  runId: string,
): Promise<Result<readonly { runId: string; namespace: string; stage: string }[]>> => {
  const digest = await topologyObservability.runFrames(namespace, runId, 48);
  if (!digest.ok) {
    return digest;
  }

  return ok(
    digest.value.map((entry) => ({
      runId: String(entry.runId),
      namespace: entry.namespace,
      stage: entry.phase,
    })),
  );
};

export const runAsTopologyDigest = async (tenantId: string, namespace: NamespaceTag): Promise<string> => {
  const payload = await collectTopologyDigest(namespace);
  if (!payload.ok) {
    return `error:${payload.error.message}`;
  }

  const signature = payload.value.summary.batch.signatures.at(0) ?? asRunId(`digest:${tenantId}:${namespace}`);
  return `${tenantId}:${namespace}:${payload.value.summary.batch.runCount}:${payload.value.summary.batch.eventCount}:${signature}`;
};

export const useTopologySummary = <TValue,>(
  input: EventCollectorOptions,
  transform: (value: TopologyResult) => TValue,
): TValue => {
  const topology = buildPlanSnapshot(input);
  return transform(topology);
};

export const normalizePolicySet = (input: readonly string[]): string =>
  normalizePolicies(input).join('|');

export const asTopologyPolicy = (policy: string): WorkspacePolicy => {
  const normalized = normalizePolicy(policy);
  return workspacePolicy(normalized.replace(/^policy:/, ''));
};

export const createTopologySeed = (namespace: string, count = 5): readonly EcosystemPlugin[] => {
  const tenantId = asPolicyId(namespace);
  const tag = asRunId(`run:${count}:${namespace}`);
  void tag;
  const policies = workspacePolicies(['baseline', 'observability', 'forecast']);

  return policies
    .toSorted()
    .map((policy, index) => {
      const run: EcosystemPlugin['run'] = async () => ({
        status: 'success',
        output: {
          output: {
            event: `trace:${tenantId}`,
            policy: policy as unknown as JsonValue,
            index,
          },
          summary: 'trace',
          consumed: 1,
          produced: 1,
          artifacts: ['artifact:trace'],
        },
        logs: [`trace:${tenantId}`],
        message: `trace:${policy.id}`,
        elapsedMs: 1,
        artifacts: [],
        skipped: false,
      });
      return {
        name: `plugin:${policy.id.replace(/^policy:/, '')}` as EcosystemPlugin['name'],
        namespace: composeNamespace('namespace', namespace),
        version: 'v1.0' as const,
        dependsOn: ['plugin:bootstrap' as const],
        description: `policy:${policy.name}`,
        tags: ['tag:default'],
        run,
        pluginFor: run,
      } as EcosystemPlugin;
    }) as readonly EcosystemPlugin[];
};
