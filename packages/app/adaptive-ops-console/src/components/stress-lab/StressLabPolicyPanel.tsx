import { type ReactNode, useMemo } from 'react';
import type { OrchestratorReport } from '@domain/recovery-stress-lab';

interface StressLabPolicyPanelProps {
  readonly report: OrchestratorReport | null;
}

const statusColor = (value: number): string => {
  if (value === 0) return '#ff6b6b';
  if (value > 3) return '#f4a261';
  return '#2a9d8f';
};

const PolicyList = ({ children }: { readonly children: ReactNode }) => {
  return <ul>{children}</ul>;
};

export const StressLabPolicyPanel = ({ report }: StressLabPolicyPanelProps) => {
  const recommendations = useMemo(() => report?.recs ?? [], [report?.recs]);
  const warnings = useMemo(() => report?.warnings ?? [], [report?.warnings]);
  const telemetry = useMemo(() => report?.telemetry ?? null, [report?.telemetry]);
  const digest = useMemo(() => telemetry?.digest ?? 'none', [telemetry]);

  const warningElements = warnings
    .map((entry, index) => ({
      key: `warn:${index}`,
      label: entry,
      color: statusColor(index),
    }))
    .map((entry) => ({
      ...entry,
      text: entry.label.length > 120 ? entry.label.slice(0, 117) + '...' : entry.label,
    }));

  return (
    <section className="stress-lab-policy-panel">
      <h3>Policy Recommendations</h3>
      <div>
        <strong>Session</strong>: {report?.sessionId ?? 'waiting'}
      </div>
      <div>
        <strong>Tenant</strong>: {report?.tenantId ?? 'unknown'}
      </div>
      <div>
        <strong>Digest</strong>: {digest}
      </div>

      <div className="recommendations">
        <h4>Recommended plans</h4>
        <PolicyList>
          {recommendations.map((recommendation) => (
            <li key={`recommendation:${recommendation}`}>{recommendation}</li>
          ))}
        </PolicyList>
      </div>

      <div className="warnings">
        <h4>Warnings</h4>
        <PolicyList>
          {warningElements.map((entry) => (
            <li key={entry.key} style={{ color: entry.color }}>
              {entry.text}
            </li>
          ))}
        </PolicyList>
      </div>
    </section>
  );
};
