import { useMemo } from 'react';
import type { CampaignRunResult } from '@domain/fault-intel-orchestration';

interface FaultIntelDiagnosticsPanelProps {
  readonly run?: CampaignRunResult;
  readonly onRefresh: () => void;
}

const thresholds = {
  low: 0,
  medium: 12,
  high: 24,
  urgent: 36,
} as const;

export const FaultIntelDiagnosticsPanel = ({ run, onRefresh }: FaultIntelDiagnosticsPanelProps) => {
  const score = useMemo(() => {
    if (!run) {
      return {
        risk: 'n/a',
        density: 0,
        threshold: 'low',
        active: false,
      };
    }

    const density = Math.round(run.signals.length / 4);
    return {
      risk: run.riskScore.toFixed(2),
      density,
      threshold: density > thresholds.urgent ? 'urgent' : density > thresholds.high ? 'high' : density > thresholds.medium ? 'medium' : 'low',
      active: run.signals.some((signal) => signal.severity === 'critical'),
    };
  }, [run]);

  return (
    <section style={{ border: '1px solid #0f172a', borderRadius: 12, padding: 12, background: 'rgba(15,23,42,0.85)' }}>
      <h3 style={{ marginTop: 0, marginBottom: 8, color: '#f8fafc' }}>Diagnostics</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        <div>Risk score: {score.risk}</div>
        <div>Density: {score.density}</div>
        <div>Threshold: {score.threshold}</div>
        <div style={{ color: score.active ? '#facc15' : '#94a3b8' }}>Critical signal active: {score.active ? 'yes' : 'no'}</div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        style={{ marginTop: 10, border: '1px solid #2563eb', background: '#1d4ed8', color: '#fff', borderRadius: 8, padding: '8px 12px' }}
      >
        Recompute diagnostics
      </button>
    </section>
  );
};
