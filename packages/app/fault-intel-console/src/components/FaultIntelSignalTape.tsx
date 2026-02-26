import { useMemo } from 'react';
import type { CampaignRunResult } from '@domain/fault-intel-orchestration';

interface FaultIntelSignalTapeProps {
  readonly run?: CampaignRunResult;
  readonly maxSignals: number;
}

const palette: Record<string, string> = {
  critical: '#f43f5e',
  warning: '#f59e0b',
  advisory: '#22d3ee',
  notice: '#38bdf8',
};

export const FaultIntelSignalTape = ({ run, maxSignals }: FaultIntelSignalTapeProps) => {
  const entries = useMemo(() => {
    if (!run) {
      return [];
    }
    return [...run.signals]
      .slice(0, maxSignals)
      .map((signal, index) => ({
        key: signal.signalId,
        title: signal.title,
        severity: signal.severity,
        transport: signal.transport,
        detector: signal.detector,
        index,
      }));
  }, [run, maxSignals]);

  return (
    <section style={{ marginTop: 12 }}>
      <h3 style={{ margin: '0 0 8px' }}>Signal tape</h3>
      <div style={{ display: 'flex', overflowX: 'auto', gap: 8 }}>
        {entries.map((entry) => (
          <article
            key={entry.key}
            style={{
              minWidth: 220,
              border: `1px solid ${palette[entry.severity] ?? '#334155'}`,
              borderRadius: 8,
              padding: 10,
              background: 'rgba(2,6,23,0.65)',
            }}
          >
            <div style={{ color: palette[entry.severity] ?? '#cbd5e1', fontWeight: 700 }}>{entry.severity}</div>
            <p style={{ margin: '6px 0' }}>{entry.title}</p>
            <p style={{ margin: '4px 0', color: '#94a3b8' }}>{entry.transport}</p>
            <small style={{ color: '#64748b' }}>idx {entry.index} • {entry.detector}</small>
          </article>
        ))}
      </div>
    </section>
  );
};
