import { type ReactElement, type ChangeEvent, useMemo, useState } from 'react';
import { type PolicyInsightsOutput } from '../hooks/useRecoveryIncidentLabPolicyInsights';

interface Props {
  readonly windows: PolicyInsightsOutput['windows'];
}

interface CellProps {
  readonly index: number;
  readonly window: PolicyInsightsOutput['windows'][number];
}

const Bucket = ({ index, window }: CellProps): ReactElement => {
  const tone = window.score >= 80 ? 'strong' : window.score >= 50 ? 'warn' : 'weak';
  return (
    <li className={`bucket ${tone}`}>
      <p>
        {index + 1}. {window.window}
      </p>
      <p>score {window.score}</p>
      <ul>
        {window.recommendations.map((note) => (
          <li key={`${window.window}-${note}`}>{note}</li>
        ))}
      </ul>
    </li>
  );
};

export const ScenarioLabSignalsHeatmap = ({ windows }: Props): ReactElement => {
  const [filter, setFilter] = useState<'all' | 'alerts' | 'warnings'>('all');
  const filtered = useMemo(() => {
    if (filter === 'all') {
      return windows;
    }
    if (filter === 'alerts') {
      return windows.filter((entry) => entry.score >= 80);
    }
    return windows.filter((entry) => entry.score < 80);
  }, [filter, windows]);

  const alerts = useMemo(() => windows.filter((entry) => entry.score < 50).length, [windows]);
  const avgScore = useMemo(() => {
    if (windows.length === 0) {
      return 0;
    }
    const total = windows.reduce((acc, entry) => acc + entry.score, 0);
    return Math.round(total / windows.length);
  }, [windows]);

  const onFilter = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'alerts' || value === 'warnings' || value === 'all') {
      setFilter(value);
    }
  };

  return (
    <section className="scenario-lab-signals-heatmap">
      <header>
        <h2>Timeline policy windows</h2>
        <label htmlFor="policy-filter">View</label>
        <select id="policy-filter" value={filter} onChange={onFilter}>
          <option value="all">all</option>
          <option value="alerts">alerts</option>
          <option value="warnings">warnings</option>
        </select>
      </header>
      <p>windows: {windows.length}</p>
      <p>alerts: {alerts}</p>
      <p>average score: {avgScore}</p>
      <ul>
        {filtered.map((entry, index) => (
          <Bucket key={entry.window} index={index} window={entry} />
        ))}
      </ul>
    </section>
  );
};
