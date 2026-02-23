import type { CadenceWindowForecast } from '@domain/recovery-cadence-orchestration';

type CadenceTimelineProps = {
  title: string;
  plans: Readonly<Record<string, CadenceWindowForecast[]>>;
};

export const CadenceTimeline = ({ title, plans }: CadenceTimelineProps) => {
  const all = Object.entries(plans);

  return (
    <section style={{ border: '1px solid #2d3c53', borderRadius: 12, padding: 12, background: '#0c111b' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {all.length === 0 && <p>No timelines yet.</p>}
      {all.map(([planId, forecast]) => (
        <div key={planId} style={{ marginBottom: 12 }}>
          <h4 style={{ marginBottom: 8 }}>Plan {planId}</h4>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {forecast.length === 0 && <li>Waiting for forecast</li>}
            {forecast.map((point) => (
              <li key={`${planId}-${point.windowId}`} style={{ marginBottom: 6 }}>
                <strong>{point.windowId}</strong> — risk {point.riskScore.toFixed(2)}
                <div style={{ fontSize: 12, color: '#9fb0cc' }}>
                  confidence {Math.round(point.confidence * 100)}% · projected start {point.projectedStartAt}
                </div>
                <div style={{ fontSize: 12, color: '#9fb0cc' }}>
                  collisions {point.expectedCollisions.join(', ') || 'none'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
};
