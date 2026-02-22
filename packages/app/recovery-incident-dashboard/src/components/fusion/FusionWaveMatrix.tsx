import { useMemo } from 'react';
import type { FusionSignal, FusionWave } from '@domain/recovery-fusion-intelligence';

interface FusionWaveMatrixProps {
  readonly waves: readonly FusionWave[];
  readonly signals: readonly FusionSignal[];
  readonly className?: string;
  readonly onSelectWave: (waveId: string) => void;
}

const formatWindow = (start: string, end: string): string => {
  const startLabel = start.slice(11, 16);
  const endLabel = end.slice(11, 16);
  return `${startLabel}-${endLabel}`;
};

const scoreStyle = (score: number): string => {
  if (score >= 0.8) return 'green';
  if (score >= 0.6) return 'yellow';
  if (score >= 0.4) return 'orange';
  return 'red';
};

const normalizeSeverity = (severity: number): number => {
  if (!Number.isFinite(severity)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(severity * 100)));
};

export const FusionWaveMatrix = ({ waves, signals, className, onSelectWave }: FusionWaveMatrixProps) => {
  const buckets = useMemo(() => {
    const rows = waves.map((wave, index) => {
      const signalCount = signals.filter((signal) => signal.id.startsWith(wave.id)).length;
      return {
        wave,
        index,
        signalCount,
        window: formatWindow(wave.windowStart, wave.windowEnd),
        riskColor: scoreStyle(wave.score),
      };
    });

    return rows.sort((a, b) => a.index - b.index);
  }, [signals, waves]);

  return (
    <div className={className ?? 'fusion-matrix'}>
      <div className="fusion-matrix-header">Wave Matrix</div>
      <div className="fusion-matrix-grid">
        {buckets.map((entry) => (
          <button
            type="button"
            key={entry.wave.id}
            className={`fusion-wave-cell fusion-wave-${entry.riskColor}`}
            onClick={() => onSelectWave(entry.wave.id)}
          >
            <span className="fusion-wave-id">{entry.wave.id}</span>
            <span className="fusion-wave-window">{entry.window}</span>
            <span className="fusion-wave-score">{normalizeSeverity(entry.wave.score)}%</span>
            <span className="fusion-wave-state">{entry.wave.state}</span>
            <span className="fusion-wave-commands">commands: {entry.wave.commands.length}</span>
            <span className="fusion-wave-signals">signals: {entry.signalCount}</span>
          </button>
        ))}
      </div>
      {buckets.length === 0 ? <div className="fusion-empty">No waves available</div> : null}
    </div>
  );
};

export const fusionWaveMatrixStyles = {
  container: 'padding: 12px;',
  header: 'font-weight: 600; margin-bottom: 8px;',
  badge: 'border-radius: 6px; padding: 4px 6px;',
};
