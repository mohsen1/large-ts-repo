import { type ReactElement, type ReactNode, useMemo } from 'react';
import type { Recommendation, ForecastSummary } from '@domain/recovery-stress-lab-intelligence';

type PanelProps = {
  readonly summary: ForecastSummary | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly recommendations: readonly Recommendation[];
  readonly error: string | null;
  readonly onRefresh: () => Promise<unknown>;
  readonly onExport: () => void;
};

const severityWeight: Record<Recommendation['severity'], number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
};

const severityBadge = (severity: Recommendation['severity']): string => {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
};

const section = (label: string, children: ReactNode): ReactElement => (
  <section key={label} style={{ display: 'grid', gap: 8 }}>
    <h3 style={{ margin: '4px 0' }}>{label}</h3>
    {children}
  </section>
);

export const StressLabIntelligencePanel = ({
  summary,
  status,
  recommendations,
  error,
  onRefresh,
  onExport,
}: PanelProps): ReactElement => {
  const topRecommendation = useMemo(
    () =>
      recommendations
        .toSorted((left, right) => severityWeight[right.severity] - severityWeight[left.severity])
        .at(0),
    [recommendations],
  );

  const average = summary ? summary.average.toFixed(3) : '0.000';
  const range = summary ? `${summary.min.toFixed(3)} - ${summary.max.toFixed(3)}` : 'unknown';

  return (
    <section style={{ display: 'grid', gap: 16, padding: 12, border: '1px solid #2d4a4f', borderRadius: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Stress Lab Intelligence</h2>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <button type="button" onClick={onRefresh} disabled={status === 'loading'}>
            {status === 'loading' ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={onExport}>
            Export
          </button>
        </div>
      </header>

      {status === 'error' ? <p style={{ color: '#ff8888' }}>{error}</p> : null}

      {section(
        'Summary',
        <ul>
          <li>Status: {status}</li>
          <li>Total forecast points: {summary?.total ?? 0}</li>
          <li>Average score: {average}</li>
          <li>Forecast range: {range}</li>
          <li>Recommendations: {recommendations.length}</li>
        </ul>,
      )}

      {section(
        'Top recommendation',
        topRecommendation
          ? (
              <div>
                <p>
                  <strong>{topRecommendation.code}</strong>
                </p>
                <p>{topRecommendation.rationale}</p>
                <p>Severity: {severityBadge(topRecommendation.severity)}</p>
                <p>Estimate: {topRecommendation.estimatedMitigationMinutes}m</p>
              </div>
            )
          : <p>No recommendation yet.</p>,
      )}

      {section(
        'Recommendations by phase',
        <ul>
          {Object.entries(
            recommendations.reduce<Record<string, number>>((acc, rec) => {
              const entry = acc[rec.phase] ?? 0;
              acc[rec.phase] = entry + 1;
              return acc;
            }, {}),
          ).map(([phase, count]) => (
            <li key={phase}>{`${phase}: ${count}`}</li>
          ))}
        </ul>,
      )}
    </section>
  );
};

export default StressLabIntelligencePanel;
