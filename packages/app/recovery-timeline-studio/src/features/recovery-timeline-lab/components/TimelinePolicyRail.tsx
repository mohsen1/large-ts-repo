import { useMemo } from 'react';
import type { ReactElement } from 'react';

interface TimelinePolicyRailProps {
  timelineId: string;
  steps: readonly string[];
  riskWindow: readonly [number, number];
}

export function TimelinePolicyRail({ timelineId, steps, riskWindow }: TimelinePolicyRailProps): ReactElement {
  const styleForRisk = useMemo(() => {
    const [low, high] = riskWindow;
    if (high >= 80) {
      return 'risk-high';
    }
    if (low >= 50) {
      return 'risk-medium';
    }
    return 'risk-low';
  }, [riskWindow]);

  return (
    <aside>
      <h3>Policy Rail — {timelineId}</h3>
      <p className={styleForRisk}>
        Risk window {riskWindow[0]} - {riskWindow[1]}
      </p>
      <ol>
        {steps.map((step, index) => (
          <li key={step}>
            <strong>{index + 1}</strong>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
