import { AdaptiveDecision, AdaptivePolicy } from '@domain/adaptive-ops';

interface PlaybookDependencyGraphProps {
  policies: readonly AdaptivePolicy[];
  decisions: readonly AdaptiveDecision[];
}

interface Node {
  policyId: string;
  dependencies: readonly string[];
}

const resolveNodes = (policies: readonly AdaptivePolicy[]): readonly Node[] =>
  policies.map((policy) => ({
    policyId: `${policy.id}`,
    dependencies: [...new Set(policy.dependencies.map((dependency) => `${dependency.serviceId}`))],
  }));

const policyDegrees = (policies: readonly Node[]) => {
  const inbound = new Map<string, number>();
  for (const policy of policies) {
    inbound.set(policy.policyId, 0);
  }
  for (const policy of policies) {
    for (const dependency of policy.dependencies) {
      inbound.set(dependency, (inbound.get(dependency) ?? 0) + 1);
    }
  }
  return inbound;
} ;

const sortByDependencyCount = (policies: readonly Node[]) => {
  const degrees = policyDegrees(policies);
  return [...policies].sort((left, right) => {
    const leftValue = degrees.get(right.policyId) ?? 0;
    const rightValue = degrees.get(right.policyId) ?? 0;
    return leftValue - rightValue;
  });
};

export const PlaybookDependencyGraph = ({ policies, decisions }: PlaybookDependencyGraphProps) => {
  const nodes = resolveNodes(policies);
  const ordered = sortByDependencyCount(nodes);
  const decisionPolicyIds = new Set(decisions.map((decision) => `${decision.policyId}`));

  return (
    <section className="playbook-dependency-graph">
      <h3>Policy dependency graph</h3>
      <table>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Dependencies</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((node) => {
            const active = decisionPolicyIds.has(node.policyId);
            return (
              <tr key={node.policyId} className={active ? 'active' : 'inactive'}>
                <td>{node.policyId}</td>
                <td>{node.dependencies.join(', ') || 'none'}</td>
                <td>{active ? 'selected' : 'idle'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
