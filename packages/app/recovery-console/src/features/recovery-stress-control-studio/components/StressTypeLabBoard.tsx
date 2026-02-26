import { memo, useMemo } from 'react';
import type { StressTypeLabMode, StressTypeCommandRow } from '../types/stressTypeLabSchema';
import type { useStressTypeOrchestrator } from '../hooks/useStressTypeOrchestrator';

type BoardProps = ReturnType<typeof useStressTypeOrchestrator>;

const SeverityChip = memo(({ severity }: { readonly severity: number }) => {
  const tone = severity > 6 ? 'high' : severity > 3 ? 'mid' : 'low';
  const symbol = tone === 'high' ? '●' : tone === 'mid' ? '◌' : '○';
  return <span>{`${symbol} ${tone}`}</span>;
});

const commandRowStyle = {
  low: 'color: #2d2d2d',
  mid: 'color: #8f6f2b',
  high: 'color: #9b1c1c',
};

const modeLabel = (mode: StressTypeLabMode): string => {
  if (mode === 'explore') return 'Explore';
  if (mode === 'simulate') return 'Simulate';
  if (mode === 'validate') return 'Validate';
  if (mode === 'audit') return 'Audit';
  if (mode === 'stress') return 'Stress';
  return 'Graph';
};

const toLabel = (command: StressTypeCommandRow): string => `${command.rowId} ${command.route.map((entry) => entry.join(':')).join(' -> ')}`;

const commandClass = (command: StressTypeCommandRow): keyof typeof commandRowStyle => {
  if (command.severity > 6) return 'high';
  if (command.severity > 3) return 'mid';
  return 'low';
};

export const StressTypeLabBoard = (props: BoardProps) => {
  const severityBuckets = useMemo(
    () =>
      props.commandBuckets.low.length + props.commandBuckets.mid.length + props.commandBuckets.high.length,
    [props.commandBuckets.high.length, props.commandBuckets.low.length, props.commandBuckets.mid.length],
  );

  const outcomes = useMemo(
    () => props.branchOutcomes.map((outcome) => ({
      label: outcome.label,
      scoreModifier: outcome.scoreModifier,
      escalate: outcome.shouldEscalate,
      pause: outcome.shouldPause,
    })),
    [props.branchOutcomes],
  );

  const score = outcomes.reduce((acc, entry) => acc + entry.scoreModifier, 0);

  return (
    <section>
      <h2>Stress Type Lab Board</h2>
      <p>Mode: {modeLabel(props.state.mode)}</p>
      <p>Pressure: {props.metrics.pressure}</p>
      <p>Queue: {props.metrics.queueSize}</p>
      <p>Resolved: {props.metrics.resolvedCount}</p>
      <p>Buckets: {severityBuckets}</p>
      <p>Score: {score}</p>
      <div>
        <button type="button" onClick={() => props.run(1)}>
          Run x1
        </button>
        <button type="button" onClick={() => props.run(3)}>
          Run x3
        </button>
        <button type="button" onClick={props.pause}>
          Pause
        </button>
        <button type="button" onClick={props.resume}>
          Resume
        </button>
        <button type="button" onClick={props.clear}>
          Clear
        </button>
      </div>
      <div>
        <h3>Commands</h3>
        <ul>
          {props.state.snapshot.commands.map((command) => (
            <li
              key={command.rowId}
              style={{ listStyleType: 'none', ...{ color: commandRowStyle[commandClass(command)] } }}
              onClick={() =>
                props.enqueue({
                  ...command,
                  active: !command.active,
                })
              }
            >
              <SeverityChip severity={command.severity} /> {toLabel(command)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Branch outcomes</h3>
        <table>
          <thead>
            <tr>
              <th>label</th>
              <th>score</th>
              <th>pause</th>
              <th>escalate</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.slice(0, 12).map((entry, index) => (
              <tr key={`${entry.label}-${index}`}>
                <td>{entry.label}</td>
                <td>{entry.scoreModifier}</td>
                <td>{entry.pause ? 'yes' : 'no'}</td>
                <td>{entry.escalate ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
