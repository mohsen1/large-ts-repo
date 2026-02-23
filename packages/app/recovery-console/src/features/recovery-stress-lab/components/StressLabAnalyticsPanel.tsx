import { useMemo } from 'react';
import { RecommendationViewModel } from '../hooks/useStressLabRecommendations';

interface Props {
  readonly report: RecommendationViewModel | null;
  readonly metrics: {
    readonly nodes: number;
    readonly edges: number;
    readonly issues: number;
    readonly warnings: number;
    readonly topCode: string;
  } | null;
}

const impactLabel = (value: number): string => {
  if (value > 20) return 'critical';
  if (value > 10) return 'high';
  if (value > 5) return 'medium';
  return 'low';
};

export const StressLabAnalyticsPanel = ({ report, metrics }: Props) => {
  const priorities = useMemo(() => {
    if (!report) return [] as string[];
    return [
      ...report.grouped.byImpact.high.map((entry) => `high:${entry.code}`),
      ...report.grouped.byImpact.medium.map((entry) => `med:${entry.code}`),
      ...report.grouped.byImpact.low.map((entry) => `low:${entry.code}`),
    ];
  }, [report]);

  if (!report || !metrics) {
    return (
      <section>
        <h2>Analytics</h2>
        <p>No analytics available</p>
      </section>
    );
  }

  const severity = impactLabel(Math.max(metrics.issues, metrics.warnings));
  return (
    <section>
      <h2>Stress Lab Analytics</h2>
      <p>{`Tenant ${report.tenantId}`}</p>
      <p>{`Summary: ${report.summary}`}</p>
      <p>{`Topology: ${metrics.nodes} nodes / ${metrics.edges} edges`}</p>
      <p>{`Top recommendation: ${metrics.topCode}`}</p>
      <p>{`Issue severity: ${severity}`}</p>
      <p>{`Priorities: ${report.priorityCount}, Optional: ${report.optionalCount}`}</p>

      <ul>
        {priorities.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
};
