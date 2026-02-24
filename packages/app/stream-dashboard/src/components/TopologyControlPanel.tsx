import { useMemo, useState } from 'react';
import { StreamPolicyAction } from '@service/streaming-control';

interface TopologyControlPanelProps {
  readonly streamId: string;
  readonly actions: readonly StreamPolicyAction[];
}

const severityWeight = {
  ok: 1,
  warn: 2,
  critical: 3,
} as const;

export const TopologyControlPanel = ({
  streamId,
  actions,
}: TopologyControlPanelProps) => {
  const [selected, setSelected] = useState<string>('all');
  const options = ['all', 'ok', 'warn', 'critical'];
  const filtered = useMemo(() => {
    if (selected === 'all') return actions;
    return actions.filter((action) => action.level === selected);
  }, [actions, selected]);

  const riskScore = useMemo(() => actions.reduce((acc, action) => acc + severityWeight[action.level], 0), [actions]);

  return (
    <section>
      <h2>Topology control</h2>
      <p>Target stream: {streamId}</p>
      <p>Risk score: {riskScore}</p>
      <label htmlFor="topology-level">Filter:</label>
      <select
        id="topology-level"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
      <ul>
        {filtered.map((action) => (
          <li key={`${action.command}-${action.level}`}>
            <span>{action.streamId}</span>
            <span> :: </span>
            <span>{action.command}</span>
            <span> :: </span>
            <strong>{action.level}</strong>
          </li>
        ))}
      </ul>
      <small>Controls are advisory only; apply at your own risk.</small>
    </section>
  );
};
