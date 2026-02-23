import { useMemo } from 'react';
import type { FusionWave } from '@domain/recovery-fusion-intelligence';
import type { FusionWorkspaceSnapshot } from '../../types/recoveryFusionWorkspace';

interface FusionReadinessPulseProps {
  readonly snapshot: FusionWorkspaceSnapshot;
  readonly selectedWaveId?: string;
  readonly onWaveSelect: (waveId: string) => void;
}

export const FusionReadinessPulse = ({ snapshot, selectedWaveId, onWaveSelect }: FusionReadinessPulseProps) => {
  const totalSignals = useMemo(
    () => snapshot.waves.reduce((sum, wave) => sum + wave.readinessSignals.length, 0),
    [snapshot.waves],
  );
  const orderedWaves = useMemo(
    () => [...snapshot.waves].sort((a, b) => b.score - a.score).slice(0, 12),
    [snapshot.waves],
  );
  const maxSignals = Math.max(1, ...orderedWaves.map((wave) => wave.readinessSignals.length));

  return (
    <section>
      <h3>Readiness Pulse</h3>
      <p>Updated {snapshot.timestamp} · Waves: {snapshot.waves.length} · Signals: {totalSignals}</p>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {orderedWaves.map((wave) => {
          const width = `${Math.max(5, (wave.readinessSignals.length / maxSignals) * 100)}%`;
          const isSelected = wave.id === selectedWaveId;
          return (
            <button
              key={wave.id}
              type="button"
              onClick={() => onWaveSelect(wave.id)}
              style={{
                padding: '0.5rem',
                textAlign: 'left',
                border: `1px solid ${isSelected ? '#0ea5e9' : '#94a3b8'}`,
              }}
            >
              <div>{wave.id}</div>
              <div>state: {wave.state}</div>
              <div>commands: {wave.commands.length}</div>
              <div style={{ width, background: '#22c55e', height: '4px' }} />
              <small>score {wave.score.toFixed(3)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
};
