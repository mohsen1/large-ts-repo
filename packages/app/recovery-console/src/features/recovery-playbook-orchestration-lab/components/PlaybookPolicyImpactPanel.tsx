import type { RunResult } from '@service/recovery-playbook-orchestrator';

type Props = {
  readonly summary?: RunResult;
};

export const PlaybookPolicyImpactPanel = ({ summary }: Props) => {
  if (!summary) {
    return (
      <section>
        <h3>Policy impact</h3>
        <p>No run selected.</p>
      </section>
    );
  }

  const highSevCount = summary.policyViolations.filter(
    (item) => item.severity === 'high' || item.severity === 'critical',
  ).length;

  return (
    <section>
      <h3>Policy impact</h3>
      <p>Outcome ID: {summary.outcome.id}</p>
      <p>Success: {String(summary.outcome.success)}</p>
      <p>Final band: {summary.outcome.finalBand}</p>
      <p>Policy warnings: {highSevCount}</p>
      <p>Duration mins: {summary.outcome.durationMinutes}</p>
      <table>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Reason</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {summary.policyViolations.map((violation) => (
            <tr key={violation.policyId}>
              <td>{violation.policyId}</td>
              <td>{violation.reason}</td>
              <td>{violation.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
