import { useMemo } from 'react';
import { useDesignStudioWorkspace } from '../hooks/useDesignStudioWorkspace';

interface DesignPolicyBoardProps {
  readonly tenant: string;
  readonly workspace: string;
}

interface PolicyMetric {
  readonly policy: string;
  readonly score: number;
  readonly tags: readonly string[];
}

const defaultPolicies: readonly PolicyMetric[] = [
  { policy: 'latency', score: 0.82, tags: ['throughput', 'p95'] },
  { policy: 'cost', score: 0.57, tags: ['budget', 'forecast'] },
  { policy: 'safety', score: 0.93, tags: ['compliance', 'governance'] },
];

export const DesignPolicyBoard = ({ tenant, workspace }: DesignPolicyBoardProps) => {
  const workspaceState = useDesignStudioWorkspace({ tenant, workspace });

  const policies = useMemo(() => {
    return workspaceState.workspace.templates
      .map((template, index) => ({
        policy: template.templateId,
        score: ((index + 1) / Math.max(1, workspaceState.workspace.templates.length)),
        tags: template.tags,
      } as PolicyMetric));
  }, [workspaceState.workspace.templates]);

  return (
    <section style={{ border: '1px solid #cfcfcf', borderRadius: 8, padding: 10 }}>
      <h3>Policy board</h3>
      <p>workspace={tenant}/{workspace}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {policies.map((policy) => (
          <article
            key={policy.policy}
            style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: 8 }}
          >
            <h4>{policy.policy}</h4>
            <p>score={policy.score.toFixed(2)}</p>
            <ul>
              {policy.tags.length > 0
                ? policy.tags.map((tag) => <li key={`${policy.policy}-${tag}`}>{tag}</li>)
                : defaultPolicies
                    .filter((entry) => entry.policy === policy.policy)
                    .map((entry) => entry.tags.join(','))
                    .flatMap((entry) => entry.split(','))
                    .map((tag) => <li key={`${policy.policy}-${tag}`}>{tag}</li>)}
            </ul>
          </article>
        ))}
      </div>
      <p>events={workspaceState.diagnostics.length}</p>
      <button type="button" onClick={workspaceState.refresh}>refresh workspace</button>
    </section>
  );
};
