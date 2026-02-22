import type { FusionWave } from '@domain/recovery-fusion-intelligence';

export interface FusionWaveDeckProps {
  readonly waves: readonly FusionWave[];
  readonly selectedWaveId?: string;
  readonly onSelectWave: (waveId: string) => void;
}

const formatTime = (iso: string): string => new Date(iso).toLocaleTimeString();

const waveStateClass = (state: FusionWave['state']): string => {
  if (state === 'running') return 'active';
  if (state === 'blocked') return 'blocked';
  if (state === 'stable') return 'stable';
  if (state === 'failed') return 'failed';
  return 'queued';
};

export const FusionWaveDeck = ({ waves, selectedWaveId, onSelectWave }: FusionWaveDeckProps) => {
  const sorted = [...waves].sort((left, right) => left.score - right.score);
  const selected = new Set(selectedWaveId ? [selectedWaveId] : []);

  return (
    <section className="fusion-wave-deck">
      <h3>Wave deck</h3>
      <ul>
        {sorted.map((wave) => (
          <li
            key={wave.id}
            className={`wave ${waveStateClass(wave.state)} ${selected.has(wave.id) ? 'selected' : ''}`}
            onClick={() => onSelectWave(wave.id)}
          >
            <header>{wave.id}</header>
            <div>state: {wave.state}</div>
            <div>score: {wave.score.toFixed(2)}</div>
            <div>commands: {wave.commands.length}</div>
            <div>signals: {wave.readinessSignals.length}</div>
            <div>
              {formatTime(wave.windowStart)} → {formatTime(wave.windowEnd)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
