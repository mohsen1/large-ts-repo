import { useMemo } from 'react';
import type { CommandWorkspaceFilter } from '../../hooks/useRecoveryCommandCenter';

interface CommandTimelineProps {
  filter: CommandWorkspaceFilter;
  selectedCommandCount: number;
  onTenantShift?(tenantId: string): void;
}

const buckets = ['00', '15', '30', '45', '60', '75', '90'];

const severity = (value: number): 'low' | 'mid' | 'high' => {
  if (value < 30) return 'low';
  if (value < 70) return 'mid';
  return 'high';
};

export const CommandTimeline = ({ filter, selectedCommandCount, onTenantShift }: CommandTimelineProps) => {
  const points = useMemo(() => buckets.length, []);
  return (
    <section className="command-timeline">
      <header>
        <h3>Timeline preview</h3>
      </header>
      <div className="timeline-scale">
        {buckets.map((point) => (
          <span key={point}>{point}m</span>
        ))}
      </div>
      <ul>
        {Array.from({ length: points }).map((_, index) => {
          const score = (index + 1) * selectedCommandCount + filter.windowMinutes / 5;
          const label = severity(score);
          return (
            <li key={`${filter.tenantId}-${index}`} className={label}>
              <strong>t+{index * 15}m</strong>
              <p>{filter.tenantId} · score {score.toFixed(1)}</p>
              <button
                onClick={() => {
                  if (onTenantShift) {
                    onTenantShift(`${filter.tenantId}-${label}`);
                  }
                }}
              >
                Shift tenant
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
