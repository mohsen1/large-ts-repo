import { type CSSProperties } from 'react';

import { type SignalPriority } from '@domain/recovery-signal-intelligence';

interface SignalPrioritiesPanelProps {
  priorities: SignalPriority[];
  facilityName: string;
  onApproveAll: () => void;
}

const styles: Record<string, CSSProperties> = {
  container: {
    border: '1px solid #8e24aa',
    borderRadius: 10,
    padding: 16,
    display: 'grid',
    gap: 12,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 3fr 1fr',
    alignItems: 'center',
    gap: 12,
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
};

export const SignalPrioritiesPanel = ({
  priorities,
  facilityName,
  onApproveAll,
}: SignalPrioritiesPanelProps) => {
  if (priorities.length === 0) {
    return <section style={styles.container}>No prioritized signals for {facilityName}</section>;
  }

  const criticalCount = priorities.filter((priority) => priority.urgency === 'critical').length;

  return (
    <section style={styles.container}>
      <header>
        <h3>{facilityName} priority queue</h3>
        <p>
          {priorities.length} candidates · {criticalCount} critical
        </p>
      </header>
      <ul>
        {priorities.map((item) => {
          const style: CSSProperties = {
            color: item.urgency === 'critical' ? '#b71c1c' : item.urgency === 'high' ? '#ef6c00' : '#1b5e20',
          };

          return (
            <li key={item.pulseId} style={styles.row}>
              <strong style={style}>{item.rank}. {item.pulseId}</strong>
              <span>{item.why.join(' • ')}</span>
              <span style={styles.actions}>
                <b>{item.urgency}</b>
                <span>{item.projectedRecoveryMinutes}m</span>
              </span>
            </li>
          );
        })}
      </ul>
      <button onClick={onApproveAll} type="button">Approve all above threshold</button>
    </section>
  );
};
