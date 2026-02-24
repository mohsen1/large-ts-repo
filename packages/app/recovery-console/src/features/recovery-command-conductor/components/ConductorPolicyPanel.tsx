import { type ConductorWorkspaceSummary } from '../types';

interface ConductorPolicyPanelProps {
  readonly workspace: ConductorWorkspaceSummary;
  readonly onPin?: (runbook: string) => void;
}

interface PolicySummaryProps {
  readonly name: string;
  readonly commandCount: number;
  readonly ownerTeam: string;
}

const PolicySummary = ({ name, commandCount, ownerTeam }: PolicySummaryProps) => (
  <li>
    <strong>{name}</strong>
    <p>{`commands: ${commandCount}`}</p>
    <p>{`owner: ${ownerTeam}`}</p>
  </li>
);

export const ConductorPolicyPanel = ({ workspace, onPin }: ConductorPolicyPanelProps) => {
  const canPin = typeof onPin === 'function';
  return (
    <section>
      <h2>Policy runbooks</h2>
      <p>{`workspace status: ${workspace.status}`}</p>
      <ul>
        {workspace.runbooks.map((runbook) => (
          <PolicySummary
            key={runbook.id}
            name={runbook.name}
            commandCount={runbook.commandCount}
            ownerTeam={runbook.ownerTeam}
          />
        ))}
      </ul>
      <div>
        <p>actions</p>
        {workspace.runbooks.map((runbook) => (
          <button
            key={`${runbook.id}:pin`}
            type="button"
            onClick={() => canPin && onPin?.(runbook.id)}
            disabled={!canPin}
          >
            {`pin ${runbook.name}`}
          </button>
        ))}
      </div>
      {workspace.plan ? (
        <div>
          <h3>Planned scenario</h3>
          <p>{workspace.plan.scenarioName}</p>
          <p>{`est minutes: ${workspace.plan.estimatedCompletionMinutes}`}</p>
        </div>
      ) : (
        <p>No plan yet</p>
      )}
    </section>
  );
};
