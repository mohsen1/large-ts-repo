import { memo } from 'react';
import { usePlaybookPolicyFilters, type PolicyMatrix } from '../../hooks/usePlaybookPolicyFilters';

export interface PolicyMatrixViewProps {
  readonly scope: PolicyMatrix['scope'];
  readonly metrics: readonly {
    readonly scope: PolicyMatrix['scope'];
    readonly score: number;
    readonly drift: number;
    readonly variance: number;
    readonly confidence: number;
    readonly trend: 'increasing' | 'decreasing' | 'steady';
  }[];
  readonly onScopeChange: (scope: PolicyMatrix['scope']) => void;
  readonly minScore: number;
  readonly maxDrift: number;
  readonly compact?: boolean;
}

const scopes = ['playbook', 'platform', 'signal', 'policy', 'workflow', 'incident'] as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const asPercent = (value: number) => `${Math.round(value * 1000) / 10}%`;

const scoreClass = (value: number) => {
  if (value >= 0.75) return 'strong';
  if (value >= 0.5) return 'medium';
  if (value >= 0.25) return 'weak';
  return 'critical';
};

const trendDirection = {
  increasing: '▲',
  decreasing: '▼',
  steady: '→',
} as const;

export const PolicyMatrixView = memo(
  ({ scope, metrics, onScopeChange, minScore, maxDrift, compact = false }: PolicyMatrixViewProps) => {
    const filtered = usePlaybookPolicyFilters({
      scope,
      minScore,
      maxDrift,
      metrics: metrics.map((metric) => ({
        scope: metric.scope,
        score: metric.score,
        drift: metric.drift,
        variance: metric.variance,
        confidence: metric.confidence,
        trend: metric.trend,
      })),
    });

    const matrixRows = filtered.matrix.cells.map((cell) => {
      const isActive =
        cell.metric === 'score'
          ? filtered.matrix.averageScore >= filtered.filters.minScore
          : filtered.matrix.averageDrift <= filtered.filters.maxDrift;
      return {
        ...cell,
        isActive,
      };
    });

    const scopeSummary = compact
      ? `${scope}: ${filtered.summary}`
      : `${filtered.summary} · score ${filtered.matrix.averageScore.toFixed(2)} · drift ${filtered.matrix.averageDrift.toFixed(3)}`;

    return (
      <section className="policy-matrix-view">
        <header className="policy-matrix-view__header">
          <h3>Policy Matrix</h3>
          <p>{scopeSummary}</p>
          <div className="policy-matrix-view__toolbar">
            {scopes.map((scopeOption) => (
              <button
                type="button"
                key={scopeOption}
                onClick={() => onScopeChange(scopeOption)}
                className={scopeOption === scope ? 'active' : ''}
              >
                {scopeOption}
              </button>
            ))}
          </div>
        </header>

        <article>
          <h4>Coverage</h4>
          <p>
            {filtered.matrix.active} / {filtered.matrix.total} entries active
          </p>
          <table className="policy-matrix-view__table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Trend</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr
                  key={`${row.scope}-${row.metric}`}
                  className={row.isActive ? 'active' : 'inactive'}
                >
                  <td>{row.metric}</td>
                  <td>{row.value.toFixed(3)}</td>
                  <td title={row.trend}>
                    {trendDirection[row.trend]}
                    {' '}
                    {row.trend}
                  </td>
                  <td>
                    <span className={scoreClass(clamp(typeof row.value === 'number' ? row.value : 0))}>
                      {row.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article>
          <h4>Distribution</h4>
          <dl>
            <dt>average score</dt>
            <dd>
              {filtered.matrix.averageScore.toFixed(2)} ({asPercent(filtered.matrix.averageScore)})
            </dd>
            <dt>average drift</dt>
            <dd>{filtered.matrix.averageDrift.toFixed(3)}</dd>
          </dl>
        </article>
      </section>
    );
  },
);

PolicyMatrixView.displayName = 'PolicyMatrixView';
