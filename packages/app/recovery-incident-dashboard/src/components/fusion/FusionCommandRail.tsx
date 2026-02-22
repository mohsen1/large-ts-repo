import { useMemo } from 'react';
import type { FusionWave } from '@domain/recovery-fusion-intelligence';

interface FusionCommandRailProps {
  readonly waves: readonly FusionWave[];
  readonly selectedWaveId?: string;
  readonly onRunCommand: (command: string, waveId: string) => void;
}

const commandOptions = ['start', 'pause', 'resume', 'abort', 'verify'] as const;

type CommandOption = (typeof commandOptions)[number];

const describeCommand = (command: CommandOption): string => {
  switch (command) {
    case 'start':
      return 'Start recovery';
    case 'pause':
      return 'Pause execution';
    case 'resume':
      return 'Resume execution';
    case 'abort':
      return 'Abort wave';
    default:
      return 'Verify wave completion';
  }
};

const selectedWaveStyle = (active: boolean): string => (active ? 'fusion-selected' : '');

const commandRiskWeight = (wave: FusionWave, command: CommandOption): number => {
  const score = wave.score;
  const commandPenalty = command === 'abort' ? 0.2 : command === 'verify' ? 0.1 : 0;
  return Math.max(0, Math.min(1, score - commandPenalty));
};

export const FusionCommandRail = ({ waves, selectedWaveId, onRunCommand }: FusionCommandRailProps) => {
  const selected = useMemo(
    () => waves.find((wave) => wave.id === selectedWaveId) ?? waves[0],
    [selectedWaveId, waves],
  );

  if (!selected) {
    return <div className="fusion-empty">Select a wave to activate commands</div>;
  }

  return (
    <section className="fusion-command-rail">
      <div className="fusion-rail-title">Commands for {selected.id}</div>
      <div className="fusion-rail-grid">
        {commandOptions.map((command) => {
          const confidence = commandRiskWeight(selected, command);
          const enabled = confidence >= 0.2;

          return (
            <button
              key={command}
              type="button"
              disabled={!enabled}
              className={`fusion-command-btn ${selectedWaveStyle(Boolean(enabled))}`}
              onClick={() => enabled && onRunCommand(command, selected.id)}
            >
              <span>{command}</span>
              <span>{describeCommand(command)}</span>
              <strong>{Math.round(confidence * 100)}%</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
};
