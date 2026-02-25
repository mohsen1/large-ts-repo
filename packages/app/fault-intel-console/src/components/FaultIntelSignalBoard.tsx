import { useMemo } from 'react';
import type { CampaignRunResult } from '@domain/fault-intel-orchestration';

interface FaultIntelSignalBoardProps {
  readonly run?: CampaignRunResult;
  readonly signalCount: number;
  readonly onSelectPhase: (phase: string) => void;
}

export const FaultIntelSignalBoard = ({ run, signalCount, onSelectPhase }: FaultIntelSignalBoardProps) => {
  const topSignals = useMemo(() => {
    const signals = run?.signals ?? [];
    return signals
      .slice(0, 6)
      .map((signal) => ({
        id: signal.signalId,
        label: signal.title,
        severity: signal.severity,
      }));
  }, [run]);

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0f172a', color: '#e2e8f0' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Signal board</h3>
        <strong style={{ color: '#94a3b8' }}>{signalCount} signals</strong>
      </header>
      <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
        {topSignals.map((signal) => (
          <button
            key={signal.id}
            type="button"
            onClick={() => onSelectPhase('intake')}
            style={{ textAlign: 'left', padding: 8, borderRadius: 8, border: '1px solid #475569', background: 'rgba(59,130,246,0.15)' }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>{signal.label}</p>
            <p style={{ margin: 0, opacity: 0.75 }}>
              severity: <span style={{ color: '#facc15' }}>{signal.severity}</span>
            </p>
          </button>
        ))}
      </div>
      <footer style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['intake', 'triage', 'remediation', 'recovery'] as const).map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => onSelectPhase(phase)}
            style={{ border: '1px solid #334155', borderRadius: 20, padding: '6px 10px', background: '#0ea5e9', color: '#fff' }}
          >
            jump to {phase}
          </button>
        ))}
      </footer>
    </section>
  );
};
