import { useMemo } from 'react';
import type { OrchestrationSignal } from '@domain/recovery-orchestration-planning/src/incident-models';

export interface RecoveryScenarioSignalCardsProps {
  readonly signals: readonly OrchestrationSignal[];
  readonly onAcknowledge: (signal: string) => void;
}

const rank = (signal: OrchestrationSignal): number => {
  const absolute = Math.abs(signal.value);
  return Math.min(100, Math.floor(absolute * 100));
};

export const RecoveryScenarioSignalCards = ({ signals, onAcknowledge }: RecoveryScenarioSignalCardsProps) => {
  const sorted = useMemo(() => [...signals].sort((left, right) => rank(right) - rank(left)), [signals]);
  const highConfidence = useMemo(() => sorted.filter((signal) => rank(signal) >= 50), [sorted]);

  return (
    <section className="recovery-scenario-signal-cards">
      <h3>Signals</h3>
      <p>High confidence signals: {highConfidence.length}</p>
      <ul>
        {sorted.map((signal) => {
          const weight = rank(signal);
          const key = `${signal.incidentId}:${signal.signal}:${signal.timestamp}`;
          return (
            <li key={key} className="signal-card">
              <h4>{signal.signal}</h4>
              <p>Tenant: {signal.tenantId}</p>
              <p>Incident: {signal.incidentId}</p>
              <p>Value: {signal.value}</p>
              <p>Weight: {weight}</p>
              <p>At: {signal.timestamp}</p>
              <button type="button" onClick={() => onAcknowledge(key)}>
                Ack
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
