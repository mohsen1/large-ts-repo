import { Fragment } from 'react';
import { ThroughputRecord } from '@domain/streaming-observability';

export interface ThroughputSparklineProps {
  streamId: string;
  records: ThroughputRecord[];
  maxPoints?: number;
}

export function ThroughputSparkline({ streamId, records, maxPoints = 8 }: ThroughputSparklineProps) {
  const slice = records.slice(-maxPoints);
  const values = slice.map((record) => record.eventsPerSecond);
  const max = Math.max(1, ...values);
  const bars = values.map((value, index) => {
    const percent = (value / max) * 100;
    const key = `${streamId}-${index}`;
    return (
      <li key={key}>
        <div style={{ background: '#2c7', width: `${percent}%`, height: '8px' }} />
        <span>{value}</span>
      </li>
    );
  });

  return (
    <section>
      <h3>Sparkline {streamId}</h3>
      <ol>
        {bars}
      </ol>
      <p>points: {values.length}</p>
    </section>
  );
}
