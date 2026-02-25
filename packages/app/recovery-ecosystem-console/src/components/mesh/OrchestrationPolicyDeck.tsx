import { useMemo } from 'react';
import type { MeshPluginDefinition } from '@domain/recovery-ecosystem-orchestrator-core';

interface PolicyDefinition {
  readonly policyId: string;
  readonly description: string;
  readonly enabled: boolean;
}

interface DeckProps {
  readonly plugins: readonly MeshPluginDefinition[];
  readonly policySelector?: (plugin: MeshPluginDefinition) => readonly PolicyDefinition[];
}

export const OrchestrationPolicyDeck = (props: DeckProps) => {
  const { plugins } = props;
  const policies = useMemo(
    () =>
      plugins.flatMap((plugin) =>
        (props.policySelector?.(plugin) ??
          [
            {
              policyId: `${plugin.name}::default`,
              description: `${plugin.namespace} default policy`,
              enabled: plugin.stage !== 'archive',
            },
          ]),
      ),
    [plugins, props.policySelector],
  );

  return (
    <section>
      <h3>Policy Deck</h3>
      <div>
        {policies.map((policy) => (
          <article key={policy.policyId} style={{ marginBottom: 10 }}>
            <h4>{policy.policyId}</h4>
            <p>{policy.description}</p>
            <small>{policy.enabled ? 'enabled' : 'disabled'}</small>
          </article>
        ))}
      </div>
    </section>
  );
};
