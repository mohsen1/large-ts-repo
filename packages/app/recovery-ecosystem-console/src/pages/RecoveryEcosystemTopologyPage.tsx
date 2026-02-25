import { useMemo, type ReactElement } from 'react';
import { TopologyGraph } from '../components/TopologyGraph';
import { PolicyMatrix } from '../components/PolicyMatrix';
import { PlannerToolbar } from '../components/PlannerToolbar';
import {
  useEcosystemTopology,
  policySignatureRows,
} from '../hooks/useEcosystemTopology';
import { useEcosystemPolicyMatrix } from '../hooks/useEcosystemPolicyMatrix';
import { type NamespaceTag } from '@domain/recovery-ecosystem-core';

export const RecoveryEcosystemTopologyPage = ({
  tenantId = 'tenant:default',
  namespace = 'namespace:recovery-ecosystem',
}: {
  readonly tenantId?: string;
  readonly namespace?: string;
}): ReactElement => {
  const topology = useEcosystemTopology(tenantId, namespace);
  const matrix = useEcosystemPolicyMatrix(namespace as NamespaceTag);
  const signatures = useMemo(
    () => policySignatureRows(topology.state.policies),
    [topology.state.policies],
  );

  const sortedNodes = useMemo(
    () =>
      topology.state.policies.map((policy, index) => ({
        id: `${policy.policy}:${index}`,
        phase: 'policy',
        dependencyCount: policy.signature.length % 3,
      })),
    [topology.state.policies],
  );

  const namespaceErrors = topology.state.error ? [topology.state.error] : [];
  const matrixRows = matrix.matrix;

  return (
    <main>
      <header>
        <h1>Ecosystem Topology</h1>
        <p>{topology.summary}</p>
      </header>

      <section>
        <PlannerToolbar
          namespace={namespace}
          loading={topology.state.loading}
          onRun={() => {
            void topology.actions.runPlan();
          }}
          onRefresh={() => {
            void topology.actions.refresh();
          }}
          onExport={() => {
            navigator.clipboard.writeText(JSON.stringify(matrixRows));
          }}
        />
      </section>

      <TopologyGraph
        namespace={topology.state.namespace}
        nodes={sortedNodes}
        edges={sortedNodes.flatMap((node, index, all) => {
          const next = all[index + 1];
          if (!next) {
            return [];
          }
          return [{ from: node.id, to: next.id }];
        })}
        onSelect={() => {
          void topology.actions.loadTimeline('run:latest');
        }}
      />

      <section>
        <h2>Policy signatures</h2>
        <ul>
          {signatures.map(([name, enabled]) => (
            <li key={name}>
              {name}: {enabled}
            </li>
          ))}
        </ul>
      </section>

      <PolicyMatrix
        matrix={matrixRows}
        onToggle={(policy) => {
          matrix.actions.toggle(policy);
        }}
      />

      <section>
        {namespaceErrors.length ? (
          <ul>
            {namespaceErrors.map((entry) => (
              <li key={entry}>⚠ {entry}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
};

export const RecoveryEcosystemStudioTopologyPage = (): ReactElement => (
  <RecoveryEcosystemTopologyPage tenantId="tenant:default" namespace="namespace:recovery-ecosystem" />
);

export default RecoveryEcosystemTopologyPage;
