import { FC, Fragment, memo } from 'react';
import { type RouteTemplate, type SeverityBand } from '@domain/recovery-stress-lab';
import { type SignalOrchestratorOutput } from '@service/recovery-stress-lab-orchestrator';

type SignalDeckBucket = {
  readonly title: string;
  readonly severity: SeverityBand;
  readonly count: number;
};

type SignalDeckTrace = {
  readonly when: string;
  readonly plugin: string;
  readonly status: 'ok' | 'warn' | 'skip';
};

export interface StressLabSignalDeckProps {
  readonly tenantId: string;
  readonly route?: RouteTemplate;
  readonly planName: string;
  readonly buckets: readonly SignalDeckBucket[];
  readonly outputs: readonly SignalOrchestratorOutput[];
  readonly traces: readonly SignalDeckTrace[];
  readonly onReplay: (tenantId: string) => void;
}

const severityLabel = (severity: SeverityBand): string => {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
};

const bucketColor = (severity: SeverityBand): string => {
  if (severity === 'critical') return '#7f1d1d';
  if (severity === 'high') return '#a855f7';
  if (severity === 'medium') return '#0ea5e9';
  return '#10b981';
};

export const StressLabSignalDeck: FC<StressLabSignalDeckProps> = memo(
  ({ tenantId, route, planName, buckets, outputs, traces, onReplay }) => {
    const totalSignals = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const totalSignalsCount = Math.max(1, totalSignals);
    const replayLabel = route ?? `${tenantId}::dashboard`;
    const topOutput = outputs[0];

    return (
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, display: 'grid', gap: 14 }}>
        <header>
          <h3 style={{ margin: 0 }}>Stress Lab Signal Deck</h3>
          <p style={{ margin: 0, color: '#64748b' }}>{planName}</p>
          <small style={{ color: '#334155' }}>route {replayLabel}</small>
        </header>

        <div style={{ display: 'grid', gap: 8 }}>
          {buckets.map((bucket) => {
            const ratio = (bucket.count / totalSignalsCount) * 100;
            return (
              <div
                key={`${tenantId}:${bucket.severity}`}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${bucketColor(bucket.severity)}`,
                  padding: 8,
                  background: `${bucketColor(bucket.severity)}08`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{severityLabel(bucket.severity)}</strong>
                  <strong>{bucket.count}</strong>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    height: 6,
                    borderRadius: 4,
                    background: '#e5e7eb',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${ratio}%`,
                      background: bucketColor(bucket.severity),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <h4 style={{ margin: 0 }}>Execution Trace</h4>
          <div style={{ display: 'grid', gap: 6 }}>
            {traces.length === 0 && <p style={{ margin: 0, color: '#64748b' }}>No traces yet.</p>}
            {traces.map((trace) => {
              const tone = trace.status === 'ok' ? 'info' : 'warn';
              return (
                <Fragment key={`${tenantId}:${trace.when}:${trace.plugin}`}>
                  <div
                    style={{
                      border: `1px solid ${tone === 'warn' ? '#f97316' : '#0ea5e9'}`,
                      borderRadius: 8,
                      padding: '6px 8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                    }}
                  >
                    <span>{trace.when}</span>
                    <span>{trace.plugin}</span>
                    <span>{tone}</span>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <h4 style={{ margin: 0 }}>Topline Orchestrator Output</h4>
          <pre style={{ margin: 0, background: '#0f172a', color: '#e2e8f0', borderRadius: 8, padding: 12 }}>
            {topOutput ? `${topOutput.tenantId} · ${topOutput.banner} · ${topOutput.chain.digest}` : 'No output'}
          </pre>
        </div>

        <button
          type="button"
          style={{
            justifySelf: 'start',
            border: 0,
            borderRadius: 999,
            padding: '8px 14px',
            background: '#2563eb',
            color: 'white',
            fontWeight: 600,
          }}
          onClick={() => onReplay(tenantId)}
        >
          Replay orchestration
        </button>
      </section>
    );
  },
);
