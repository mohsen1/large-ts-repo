import { useMemo } from 'react';
import { type WorkflowSnapshot } from '../types';

interface IncidentOrchestrationPlaybookPanelProps {
  readonly snapshot: WorkflowSnapshot | undefined;
  readonly approval: boolean;
  readonly onSelectBest: () => void;
}

export const IncidentOrchestrationPlaybookPanel = ({
  snapshot,
  approval,
  onSelectBest,
}: IncidentOrchestrationPlaybookPanelProps) => {
  const orderedCandidates = useMemo(
    () => [...(snapshot?.candidates ?? [])].sort((left, right) => right.score - left.score),
    [snapshot],
  );

  const bestCandidate = orderedCandidates[0];
  const riskSignal = bestCandidate?.risks.reduce((acc, risk) => acc + risk.severity.length, 0) ?? 0;

  return (
    <aside style={{ border: '1px solid #334155', borderRadius: 10, padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Playbook candidates</h3>
      <p style={{ margin: 0, color: '#94a3b8' }}>
        {snapshot?.candidates.length ?? 0} candidates loaded •
        risk signal {riskSignal}
      </p>
      <div style={{ display: 'grid', gap: '0.45rem', maxHeight: 240, overflow: 'auto' }}>
        {orderedCandidates.slice(0, 6).map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={onSelectBest}
            style={{
              border: `1px solid ${bestCandidate?.id === candidate.id ? '#38bdf8' : '#334155'}`,
              borderRadius: 8,
              background: bestCandidate?.id === candidate.id ? '#0f172a' : '#020617',
              color: '#e2e8f0',
              padding: '0.5rem',
              display: 'grid',
              gap: '0.2rem',
              textAlign: 'left',
            }}
          >
            <span>{candidate.name}</span>
            <span>
              score {candidate.score} · risks {candidate.risks.length}
            </span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onSelectBest} disabled={!approval || !bestCandidate} style={{ borderRadius: 8 }}>
        apply best candidate
      </button>
    </aside>
  );
};
