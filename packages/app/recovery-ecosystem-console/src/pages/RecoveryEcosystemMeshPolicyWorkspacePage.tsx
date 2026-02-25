import { useMemo } from 'react';
import type { MeshPluginDefinition } from '@domain/recovery-ecosystem-orchestrator-core';
import { OrchestrationPolicyDeck } from '../components/mesh/OrchestrationPolicyDeck';
import { OrchestrationMeshTopology } from '../components/mesh/OrchestrationMeshTopology';
import { createMeshService } from '../services/meshOrchestrationService';

interface PageProps {
  readonly plugins: readonly MeshPluginDefinition[];
}

interface PolicyTemplate {
  readonly namespace: string;
  readonly policyName: string;
  readonly confidence: number;
}

export const RecoveryEcosystemMeshPolicyWorkspacePage = (props: PageProps) => {
  const service = createMeshService(props.plugins);
  const policies = useMemo(() => {
    const all = service.getPluginRegistry();
    const templates: PolicyTemplate[] = [];
    for (const [index, plugin] of all.entries()) {
      templates.push({
        namespace: plugin.namespace,
        policyName: plugin.name,
        confidence: (index + 1) / Math.max(1, all.length),
      });
    }
    return templates;
  }, [service]);

  return (
    <main>
      <h1>Recovery Mesh Policy Workspace</h1>
      <OrchestrationPolicyDeck
        plugins={props.plugins}
        policySelector={(plugin) => [
          {
            policyId: `${plugin.name}:policy:high-confidence`,
            description: `Enforce high confidence checks for ${plugin.name}`,
            enabled: plugin.tags.includes('control'),
          },
          {
            policyId: `${plugin.name}:policy:low-latency`,
            description: `Optimize ${plugin.name} stage duration`,
            enabled: plugin.stage === 'execute',
          },
        ]}
      />
      <OrchestrationMeshTopology plugins={props.plugins} />
      <section>
        <h2>Policy Templates</h2>
        <ul>
          {policies.map((policy) => (
            <li key={policy.policyName}>
              {policy.namespace}/{policy.policyName} confidence {policy.confidence.toFixed(2)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
