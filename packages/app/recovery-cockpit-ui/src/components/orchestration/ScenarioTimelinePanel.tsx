import { useMemo, useState } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { forecastExecutionTempo } from '@domain/recovery-cockpit-orchestration-core';

type ScenarioTimelinePanelProps = {
  readonly plans: readonly RecoveryPlan[];
};

type SelectedWindow = {
  readonly planId: string;
  readonly windowIndex: number;
};

const riskToScore = (risk: 'low' | 'medium' | 'high'): number => {
  if (risk === 'low') return 0.2;
  if (risk === 'medium') return 0.6;
  return 0.95;
};

export const ScenarioTimelinePanel = ({ plans }: ScenarioTimelinePanelProps) => {
  const [hovered, setHovered] = useState<SelectedWindow | undefined>(undefined);
  const tempos = useMemo(() => plans.map((plan) => ({ planId: plan.planId, tempo: forecastExecutionTempo(plan) })), [plans]);

  const labels = useMemo(
    () =>
      tempos.flatMap((entry) =>
        entry.tempo.windows.map((window) => ({
          ...window,
          planId: entry.planId,
          at: window.startAt,
          duration: window.cumulativeMinutes,
          risk: riskToScore(window.risk),
        })),
      ),
    [tempos],
  );

  const sorted = [...labels].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  const labelRisk = (riskValue: number): string => `${(riskValue * 100).toFixed(0)}%`;

  return (
    <section>
      <h3>Execution timeline</h3>
      {sorted.length === 0 ? <p>No execution windows</p> : null}
      <div style={{ borderRadius: 10, border: '1px solid #ddd', padding: 12, display: 'grid', gap: 8 }}>
        {sorted.map((item, index) => {
          const isSelected = hovered?.planId === item.planId && hovered.windowIndex === item.index;
          return (
          <div
              key={`${item.planId}-${index}`}
              onClick={() => setHovered({ planId: item.planId, windowIndex: index })}
              onMouseEnter={() => setHovered({ planId: item.planId, windowIndex: index })}
              onMouseLeave={() => setHovered(undefined)}
              style={{
                display: 'grid',
                gap: 4,
                padding: 10,
                borderRadius: 8,
                background: isSelected ? '#eff6ff' : '#fafafa',
                border: '1px solid #dbeafe',
              }}
            >
              <strong>{item.planId}</strong>
              <small>
                window #{index} · {labelRisk(item.risk)} risk · duration {item.duration.toFixed(1)}m
              </small>
              <small style={{ opacity: 0.75 }}>
                {item.startAt} → {item.endAt}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
};
