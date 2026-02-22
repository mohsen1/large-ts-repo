import { useMemo } from 'react';
import type { PolicyRunRecord } from '../hooks/useRecoveryPolicyConsole';

interface PolicyDecisionBoardProps {
  readonly records: readonly PolicyRunRecord[];
  readonly onRefresh: () => void;
}

const scoreClass = (decision: PolicyRunRecord['decision'], confidence: number): 'green' | 'amber' | 'red' => {
  if (decision === 'allow' && confidence >= 0.8) return 'green';
  if (decision === 'allow') return 'amber';
  if (confidence >= 0.6) return 'amber';
  return 'red';
};

export const PolicyDecisionBoard = ({ records, onRefresh }: PolicyDecisionBoardProps) => {
  const rows = useMemo(() => {
    return records.map((record) => ({
      ...record,
      className: scoreClass(record.decision, record.confidence),
      prettyDate: new Date(record.at).toLocaleTimeString(),
      badge: `${record.state.toUpperCase()} (${Math.round(record.confidence * 100)}%)`,
    }));
  }, [records]);

  return (
    <section className="policy-decision-board">
      <header>
        <h3>Policy decisions</h3>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
      </header>
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>State</th>
            <th>Decision</th>
            <th>Confidence</th>
            <th>Summary</th>
            <th>At</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.runId + row.at} className={row.className}>
              <td>{row.runId}</td>
              <td>{row.state}</td>
              <td>{row.decision}</td>
              <td>{row.badge}</td>
              <td>{row.summary}</td>
              <td>{row.prettyDate}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6}>No policy decisions yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
};
