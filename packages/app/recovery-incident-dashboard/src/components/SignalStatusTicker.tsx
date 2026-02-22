import { useEffect, useMemo, useState } from 'react';
import type { SignalRiskProfile } from '@domain/incident-signal-intelligence';
import { normalizeSignalRisk } from '@domain/incident-signal-intelligence';

export interface SignalStatusTickerProps {
  readonly tenantId: string;
  readonly rows: readonly SignalRiskProfile[];
  readonly refreshIntervalMs?: number;
}

interface SignalStatus {
  readonly timestamp: string;
  readonly count: number;
  readonly critical: number;
  readonly avg: number;
}

const summarize = (rows: readonly SignalRiskProfile[]): SignalStatus => {
  const critical = rows.filter((entry) => normalizeSignalRisk(entry.impactScore) === 'critical').length;
  const avg = rows.length === 0 ? 0 : Number((rows.reduce((acc, row) => acc + row.impactScore, 0) / rows.length).toFixed(4));
  return {
    timestamp: new Date().toISOString(),
    count: rows.length,
    critical,
    avg,
  };
};

export const SignalStatusTicker = ({ tenantId, rows, refreshIntervalMs = 4000 }: SignalStatusTickerProps) => {
  const [tick, setTick] = useState(0);
  const snapshot = useMemo(() => summarize(rows), [rows]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1);
    }, refreshIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [refreshIntervalMs]);

  return (
    <div className="signal-status-ticker">
      <h3>Signal Status Ticker</h3>
      <dl>
        <div>
          <dt>Tenant</dt>
          <dd>{tenantId}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{snapshot.count}</dd>
        </div>
        <div>
          <dt>Critical</dt>
          <dd>{snapshot.critical}</dd>
        </div>
        <div>
          <dt>Average impact</dt>
          <dd>{snapshot.avg}</dd>
        </div>
        <div>
          <dt>Last tick</dt>
          <dd>{snapshot.timestamp}</dd>
        </div>
      </dl>
      <small>Updates: {tick}</small>
    </div>
  );
};
