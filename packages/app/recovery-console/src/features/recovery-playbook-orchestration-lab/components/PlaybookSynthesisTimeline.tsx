import type { RunResult } from '@service/recovery-playbook-orchestrator';

type Props = {
  readonly runs: readonly RunResult[];
};

export const PlaybookSynthesisTimeline = ({ runs }: Props) => {
  if (runs.length === 0) {
    return (
      <section>
        <h3>No runs yet</h3>
        <p>Start a simulation to populate this timeline.</p>
      </section>
    );
  }

  return (
    <section>
      <h3>Run timeline</h3>
      <ol>
        {runs.map((run) => (
          <li key={run.plan.id}>
            <article>
              <h4>{run.plan.id}</h4>
              <p>Plan version: {run.plan.version}</p>
              <p>Signals: {run.policyViolations.length}</p>
              <p>Window mode: {run.plan.window.mode}</p>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
};
