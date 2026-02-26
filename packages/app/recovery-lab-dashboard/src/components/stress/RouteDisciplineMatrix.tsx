import { type ReactNode } from 'react';
import { routePreviews, type RoutePipelinePreview, parseRoute } from '@shared/type-level/stress-conditional-depth-grid';

type MatrixCell = {
  readonly route: string;
  readonly kind: string;
  readonly fingerprint: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical' | 'emergency';
  readonly active: boolean;
};

type MatrixProps = {
  readonly maxRows: number;
  readonly maxCols: number;
  readonly filterSeverity?: RoutePipelinePreview['parsed']['severity'];
};

const severityWeight = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 6,
  emergency: 8,
} as const;

const rowToCell = (route: RoutePipelinePreview, index: number): MatrixCell => {
  const parsed = route.parsed as unknown as { severity: MatrixCell['severity']; raw: string };
  const template = parseRoute(route.route);
  const fingerprint = route.fingerprint as string;
  const severity = parsed.severity ?? 'low';
  return {
    route: route.route,
    kind: template.namespace ?? 'route',
    fingerprint,
    severity,
    active: index % 2 === 0 || severity === 'critical',
  };
};

const severityChip = (severity: MatrixCell['severity']): ReactNode => {
  const alpha = severityWeight[severity];
  return <span>{severity.toUpperCase()}({alpha})</span>;
};

export const RouteDisciplineMatrix = ({ maxRows, maxCols, filterSeverity }: MatrixProps) => {
  const rows = routePreviews
    .map(rowToCell)
    .filter((row) => !filterSeverity || row.severity === filterSeverity)
    .slice(0, maxRows);

  const columns = Array.from({ length: maxCols }, (_, i) => i + 1);
  return (
    <section>
      <h3>Route Discipline Matrix</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {columns.map((col) => (
          <div key={`col-${col}`} style={{ border: '1px solid #e2e8f0', padding: 8, borderRadius: 6 }}>
            <strong>Band {col}</strong>
            <ul>
              {rows
                .filter((row, index) => index % maxCols === col - 1)
                .map((row) => (
                  <li key={row.route} style={{ margin: '6px 0', background: row.active ? '#ecfeff' : '#f8fafc', padding: 6 }}>
                    <p>{row.route}</p>
                    <p style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.fingerprint}</p>
                    <p>{severityChip(row.severity)}</p>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};
