import { useMemo } from 'react';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabCommandCenterProps {
  workspace: StreamStressLabWorkspace;
  findings: ReadonlyArray<string>;
}

export function StressLabCommandCenter({ workspace, findings }: StressLabCommandCenterProps) {
  const planActionItems = useMemo(() => {
    if (!workspace.plan) return ['Create plan first'];
    if (!workspace.plan.schedule.length) return ['Schedule windows are empty'];
    return workspace.plan.schedule.map((entry) => `${entry.runbookId} @ ${entry.startAt}`);
  }, [workspace.plan]);

  return (
    <section>
      <h3>Command Center</h3>
      <p>Active commands: {workspace.state.selectedSignals.length}</p>
      <div>
        <strong>Known issues</strong>
        <ul>
          {findings.length === 0 ? <li>None</li> : findings.map((finding) => <li key={finding}>{finding}</li>)}
        </ul>
      </div>
      <div>
        <strong>Execution plan</strong>
        <ul>
          {planActionItems.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
