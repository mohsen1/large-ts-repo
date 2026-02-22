import { IncidentWorkflowConsole } from '../components/IncidentWorkflowConsole';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { useMemo } from 'react';

interface WorkflowConsolePageProps {
  readonly repository: RecoveryIncidentRepository;
  readonly tenantId: string;
  readonly initialIncidentId?: string;
}

export const WorkflowConsolePage = ({ repository, tenantId, initialIncidentId }: WorkflowConsolePageProps) => {
  const workspace = useMemo(() => ({
    repository,
    tenantId,
    title: 'Recovery Workflow Studio',
    active: Boolean(initialIncidentId),
  }), [repository, tenantId, initialIncidentId]);

  const titleParts = [
    tenantId,
    initialIncidentId ?? 'unbound',
    workspace.active ? 'targeted' : 'unselected',
  ];

  return (
    <main className="workflow-console-page">
      <header>
        <h1>Workflow Console</h1>
        <p>{titleParts.join(' | ')}</p>
      </header>
      <article className="workflow-console-shell">
        <IncidentWorkflowConsole repository={workspace.repository} tenantId={workspace.tenantId} />
      </article>
    </main>
  );
};
