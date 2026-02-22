import { useMemo } from 'react';
import type { FusionWave } from '@domain/recovery-fusion-intelligence';

export interface FusionCommandConsoleProps {
  readonly runId: string;
  readonly tenant: string;
  readonly waves: readonly FusionWave[];
  readonly busy: boolean;
  readonly onCommand: (command: string, waveId: string, reason: string) => void;
}

export interface CommandCandidate {
  readonly label: string;
  readonly value: string;
}

const commandCandidates: CommandCandidate[] = [
  { label: 'Start', value: 'start' },
  { label: 'Pause', value: 'pause' },
  { label: 'Resume', value: 'resume' },
  { label: 'Abort', value: 'abort' },
];

export const FusionCommandConsole = ({ tenant, runId, waves, busy, onCommand }: FusionCommandConsoleProps) => {
  const options = useMemo(() => {
    return waves.flatMap((wave) =>
      commandCandidates.map((command) => ({
        key: `${tenant}:${runId}:${wave.id}:${command.value}`,
        waveId: wave.id,
        label: `${wave.id} ${command.label}`,
        command: command.value,
      })),
    );
  }, [tenant, runId, waves]);

  return (
    <section className="fusion-command-console">
      <h3>Command console · {tenant}</h3>
      <p>Run {runId}</p>
      <div className="command-grid">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            disabled={busy}
            onClick={() => onCommand(option.command, option.waveId, `ui:${option.label}`)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
};
