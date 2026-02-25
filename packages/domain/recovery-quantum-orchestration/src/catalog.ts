import {
  buildPluginRegistry,
  type QuantumContext,
  type QuantumPluginDefinition,
} from '@shared/recovery-quantum-runtime';
import type { Brand } from '@shared/type-level';
import type { PluginRuntimeFactory, QuantumPolicy, QuantumRunbook, RunbookContext } from './types';

type PolicyPlugin = {
  readonly policyId: QuantumPolicy['id'];
  readonly policyTitle: string;
  readonly execute: PluginRuntimeFactory;
};

type SignalPolicyPlugin = QuantumPluginDefinition<
  'signalPolicy',
  { readonly policyId: QuantumPolicy['id']; readonly policyTitle: string },
  PolicyPlugin
>;

type ReconcilePlugin = QuantumPluginDefinition<
  'reconciler',
  { readonly region: string; readonly limit: number },
  { readonly reconcileCount: number }
>;

type PluginMap = {
  readonly signalPolicy: SignalPolicyPlugin;
  readonly reconciler: ReconcilePlugin;
};

const pluginFactories = {
  signalPolicy: {
  kind: 'signalPolicy',
  metadata: {
    kind: 'signalPolicy',
    namespace: 'quantum',
    version: 'v::1.0',
  },
    config: {
      policyId: `tenant:policy:default` as QuantumPolicy['id'],
      policyTitle: 'default',
    },
    build: async (context: QuantumContext<object>) => {
      const normalized = context as QuantumContext<{ policyId: QuantumPolicy['id']; policyTitle: string }>;
    const policy: QuantumPolicy = {
      id: normalized.config.policyId,
      tenant: `${normalized.tenant}:runtime` as unknown as QuantumPolicy['tenant'],
      title: normalized.config.policyTitle,
      weight: 1,
      scope: [],
    };
    return {
      kind: 'signalPolicy',
      data: {
        policyId: normalized.config.policyId,
        policyTitle: normalized.config.policyTitle,
        execute: () => ({
            pluginId: `${normalized.tenant}:signal-policy` as Brand<string, 'quantum-plugin-runtime-id'>,
            payload: {
              policy,
              context,
              source: 'registry',
            },
          }),
        },
      };
    },
  },
  reconciler: {
  kind: 'reconciler',
  metadata: {
    kind: 'reconciler',
    namespace: 'quantum',
    version: 'v::1.0',
  },
    config: {
      region: 'us-east-1',
      limit: 5,
    },
    build: (context: QuantumContext<object>) => {
      const normalized = context as QuantumContext<{ region: string; limit: number }>;
      return {
        kind: 'reconciler',
        data: {
          reconcileCount: Math.max(normalized.config.limit, normalized.phase === 'runtime' ? 4 : 1),
        },
      };
    },
  },
} as PluginMap;

export const quantumRegistry = buildPluginRegistry(pluginFactories);

const buildSignalPolicyPayload = (factory: SignalPluginPayloadFactory): Promise<string> => {
  return Promise.resolve(
    `${factory.policyId}:${factory.policyTitle}:${factory.timestamp.toISOString()}`,
  );
};

type SignalPluginPayloadFactory = {
  readonly policyId: QuantumPolicy['id'];
  readonly policyTitle: string;
  readonly timestamp: Date;
};

type PluginPayloadFactory = (runbook: QuantumRunbook) => Promise<string> | string;

const pluginRuntimes = new Map<string, PluginPayloadFactory>([
  [
    'signalPolicy',
    async (runbook: QuantumRunbook) => {
      const policyId = runbook.policies[0]?.id ?? (`${runbook.tenant}:fallback` as QuantumPolicy['id']);
      const payload: SignalPluginPayloadFactory = {
        policyId,
        policyTitle: runbook.policies[0]?.title ?? 'default',
        timestamp: new Date(),
      };
      return buildSignalPolicyPayload(payload);
    },
  ],
  ['reconciler', async () => 'reconciled'],
]);

export const buildPluginPayload = async (runbook: QuantumRunbook): Promise<Record<string, string>> => {
  const output: Record<string, string> = {};
  for (const [kind, payloadFactory] of pluginRuntimes) {
    output[kind] = await payloadFactory(runbook);
  }
  return output;
};

export const isPluginConfigured = (kind: keyof PluginMap): kind is keyof PluginMap => Object.prototype.hasOwnProperty.call(pluginFactories, kind);

export const activatePlugins = async (tenantContext: RunbookContext): Promise<Record<string, unknown>> => {
  const context: QuantumContext<{ policyId: QuantumPolicy['id']; policyTitle: string }> = {
    tenant: tenantContext.tenant as unknown as Brand<string, 'tenant-id'>,
    phase: 'runtime',
    contextId: `${tenantContext.requestId}:context` as Brand<string, 'quantum-context-id'>,
    startedAt: Date.now(),
    config: {
      policyId: tenantContext.runbook.policies[0]?.id ?? (`${tenantContext.tenant}:policy` as QuantumPolicy['id']),
      policyTitle: tenantContext.runbook.policies[0]?.title ?? 'default',
    },
  };

  const runtime = await quantumRegistry.instantiate('signalPolicy', context);
  const reconcilerContext: QuantumContext<{ region: string; limit: number }> = {
    tenant: tenantContext.tenant as unknown as Brand<string, 'tenant-id'>,
    phase: 'runtime',
    contextId: `${tenantContext.requestId}:context` as Brand<string, 'quantum-context-id'>,
    startedAt: Date.now(),
    config: {
      region: tenantContext.policyMetadata.namespace,
      limit: 3,
    },
  };

  const reconciler = await quantumRegistry.instantiate('reconciler', reconcilerContext);
  return {
    signalPolicy: runtime,
    reconciler: reconciler,
    requestId: tenantContext.requestId,
  };
};
