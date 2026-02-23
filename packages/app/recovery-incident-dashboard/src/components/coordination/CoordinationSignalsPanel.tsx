import type { CoordinationAttemptReport } from '@service/recovery-coordination-orchestrator';
import { useMemo } from 'react';

export interface CoordinationSignalsPanelProps {
  readonly report: CoordinationAttemptReport | null;
  readonly selectedSignals: readonly string[];
}

const toSignal = (value: string, index: number) => {
  const [prefix, suffix] = value.split(':');
  return (
    <li key={`${value}:${index}`}>
      <strong>{prefix}</strong>
      {suffix ? `: ${suffix}` : ''}
    </li>
  );
};

export const CoordinationSignalsPanel = ({ report, selectedSignals }: CoordinationSignalsPanelProps) => {
  const candidateSignals = useMemo(() => {
    const selected = new Set<string>(selectedSignals);
    return selected.size ? [...selected] : ['selection:none'];
  }, [selectedSignals]);

  if (!report) {
    return (
      <section>
        <h3>Signals</h3>
        <p>No report available. Start a coordination run.</p>
      </section>
    );
  }

  const riskSignals = report.selection.reasons.length ? report.selection.reasons : ['reason:none'];
  const blockedSignals = report.selection.blockedConstraints.length
    ? report.selection.blockedConstraints
    : ['blocked:none'];

  return (
    <section>
      <h3>Signals ({report.runId})</h3>
      <p>Decision: {report.selection.decision}</p>
      <h4>Program signals</h4>
      <ul>
        {candidateSignals.map(toSignal)}
      </ul>
      <h4>Risk signals</h4>
      <ul>
        {riskSignals.map((entry, index) => (
          <li key={`risk-${index}`}>{entry}</li>
        ))}
      </ul>
      <h4>Blocked constraints</h4>
      <ul>
        {blockedSignals.map((entry, index) => (
          <li key={`block-${entry}-${index}`}>{entry}</li>
        ))}
      </ul>
    </section>
  );
};
