import { type JSX } from 'react';
import type { ReadinessPlaybookTemplate, ReadinessPriority } from '@domain/recovery-readiness/playbook-models';

interface ReadinessRiskRadarProps {
  templates: readonly ReadinessPlaybookTemplate[];
  selectedPriority?: ReadinessPriority;
  onPriorityChange: (value: ReadinessPriority) => void;
}

interface RiskSeriesPoint {
  point: string;
  score: number;
}

interface Sector {
  title: string;
  count: number;
  risk: number;
  color: string;
}

const priorities: ReadinessPriority[] = ['low', 'normal', 'high', 'critical'];

const riskBuckets: Sector[] = [
  { title: 'Low', count: 0, risk: 0.15, color: '#63b3ed' },
  { title: 'Moderate', count: 0, risk: 0.45, color: '#74c0fc' },
  { title: 'High', count: 0, risk: 0.7, color: '#f59f00' },
  { title: 'Critical', count: 0, risk: 0.9, color: '#fa5252' },
];

const buildSeries = (templates: readonly ReadinessPlaybookTemplate[]): RiskSeriesPoint[] => {
  return templates.map((template) => ({
    point: template.playbook.name,
    score: Math.min(100, template.playbook.steps.length * 12 + template.playbook.tags.length * 4),
  }));
};

const toSectorCounts = (values: RiskSeriesPoint[]): Sector[] => {
  const mutable = riskBuckets.map((bucket) => ({ ...bucket }));

  for (const value of values) {
    const bucket = value.score <= 25 ? 0 : value.score <= 50 ? 1 : value.score <= 75 ? 2 : 3;
    mutable[bucket].count += 1;
  }

  return mutable;
};

export const ReadinessRiskRadar: React.FC<ReadinessRiskRadarProps> = ({
  templates,
  onPriorityChange,
}) => {
  const series = buildSeries(templates);
  const sectors = toSectorCounts(series);

  const averageRisk = series.length === 0 ? 0 : series.reduce((sum, item) => sum + item.score, 0) / series.length;
  const cx = 140;
  const cy = 120;
  const radius = 110;

  return (
    <div
      style={{
        border: '1px solid #e9ecef',
        borderRadius: 12,
        padding: 16,
        background: 'linear-gradient(145deg, #f8f9fa, #ffffff)',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Readiness risk radar</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <svg width="280" height="240" role="img" aria-label="risk radar">
          <circle cx={cx} cy={cy} r={radius} fill="#edf2ff" stroke="#ced4da" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={radius * 0.66} fill="none" stroke="#adb5bd" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={radius * 0.33} fill="none" stroke="#adb5bd" strokeWidth={1} />
          <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke="#adb5bd" />
          <line x1={cx} y1={cy - radius} x2={cx} y2={cy + radius} stroke="#adb5bd" />
          {series.map((item, index) => {
            const angle = (index / Math.max(1, series.length)) * Math.PI * 2 - Math.PI / 2;
            const pointRadius = (Math.max(0, Math.min(100, item.score)) / 100) * radius;
            const x = cx + pointRadius * Math.cos(angle);
            const y = cy + pointRadius * Math.sin(angle);
            return (
              <g key={item.point}>
                <circle cx={x} cy={y} r={4} fill="#364fc7" opacity={0.8} />
                <text x={x + 8} y={y + 2} fontSize={10} fill="#343a40">
                  {item.point}
                </text>
              </g>
            );
          })}
          <text x={12} y={24} fontSize={12} fill="#2b8a3e">avg={averageRisk.toFixed(1)}</text>
        </svg>
        <div>
          <p style={{ margin: 0 }}>Average risk estimate: {averageRisk.toFixed(1)}/100</p>
          <label htmlFor="priority-filter" style={{ display: 'block', marginBottom: 8 }}>
            Filter priority
          </label>
          <select
            id="priority-filter"
            onChange={(event) => {
              const selected = event.currentTarget.value as ReadinessPriority;
              onPriorityChange(selected);
            }}
            style={{ marginBottom: 12 }}
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>

          {sectors.map((sector) => {
            const widthPx = Math.min(100, Math.max(4, sector.count * 10));
            return (
              <div key={sector.title} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{sector.title}</span>
                  <strong>{sector.count}</strong>
                </div>
                <div style={{ height: 8, background: '#f1f3f5', borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${widthPx}%`,
                      height: 8,
                      borderRadius: 999,
                      background: sector.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
