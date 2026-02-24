import type { ReactElement, ReactNode } from 'react';
import type { HealthMetric } from '../types';
import { normalize } from '@domain/recovery-chronicle-core';

export interface ChroniclePolicyPanelProps {
  readonly metrics: readonly HealthMetric[];
  readonly onSelect?: (metric: string) => void;
}

const badgeClass = (score: number): 'good' | 'warn' | 'bad' => {
  if (score >= 75) return 'good';
  if (score >= 45) return 'warn';
  return 'bad';
};

const MetricBar = ({ axis, score, trend }: HealthMetric): ReactElement => {
  const direction = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→';
  const safeAxis = normalize(axis);

  return (
    <li className={badgeClass(score)}>
      <span>{safeAxis}</span>
      <span>{direction}</span>
      <div className="bar-wrap">
        <div className="bar" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <strong>{score}</strong>
    </li>
  );
};

export const ChroniclePolicyPanel = ({ metrics, onSelect }: ChroniclePolicyPanelProps): ReactElement => {
  const rows = metrics.toSorted((left, right) => right.score - left.score);

  return (
    <section className="chronicle-policy-panel">
      <header>
        <h2>Policy Signals</h2>
      </header>
      <ul>
        {rows.map((metric) => {
          const clickHandler = onSelect ? () => onSelect(metric.axis) : undefined;
          return (
            <button key={metric.axis} type="button" onClick={clickHandler}>
              <MetricBar {...metric} />
            </button>
          );
        })}
      </ul>
    </section>
  );
};

export const MetricSummary = ({ children }: { children: ReactNode }): ReactElement => {
  return <div className="metric-summary">{children}</div>;
};
