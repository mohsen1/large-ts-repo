import { useMemo } from 'react';
import type { OrchestrationWorkspace } from '@domain/recovery-chronicle-orchestrator';

interface ChronicleWorkspacePanelProps {
  readonly workspace?: OrchestrationWorkspace;
}

export const ChronicleWorkspacePanel = ({ workspace }: ChronicleWorkspacePanelProps) => {
  const metadata = useMemo(() => {
    if (!workspace) {
      return ['no workspace'];
    }

    return [
      `id=${workspace.workspaceId}`,
      `tenant=${workspace.tenant}`,
      `policy=${workspace.policy.id}`,
      `stages=${workspace.stages.length}`,
      `parallelism=${workspace.policy.maxParallelism}`,
      `confidence=${workspace.policy.minConfidence}`,
    ];
  }, [workspace]);

  return (
    <section>
      <h3>Workspace</h3>
      <ul>
        {metadata.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
      {workspace?.stages.map((descriptor) => (
        <p key={descriptor.id}>{descriptor.id}</p>
      ))}
    </section>
  );
};
