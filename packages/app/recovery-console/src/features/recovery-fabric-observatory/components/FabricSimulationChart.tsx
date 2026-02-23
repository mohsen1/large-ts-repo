import { useMemo } from 'react';

type Point = {
  timestamp: string;
  stressScore: number;
  riskScore: number;
};

export interface FabricSimulationChartProps {
  title: string;
  points: readonly Point[];
  maxPoints?: number;
}

const formatPoint = (point: Point, index: number) => {
  const width = `${Math.min(100, point.riskScore * 100)}%`;
  const stress = `${(point.stressScore * 100).toFixed(1)}%`;
  return (
    <li key={`${point.timestamp}-${index}`}>
      <div>{point.timestamp}</div>
      <div style={{ background: '#eceff1', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width, height: 12, background: '#3f51b5' }} />
      </div>
      <div>stress {stress}</div>
    </li>
  );
};

export const FabricSimulationChart = ({ title, points, maxPoints = 50 }: FabricSimulationChartProps) => {
  const ordered = useMemo(() => {
    return [...points]
      .slice(-maxPoints)
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  }, [points, maxPoints]);

  const averageRisk = useMemo(() => {
    if (!ordered.length) {
      return 0;
    }
    const sum = ordered.reduce((acc, point) => acc + point.riskScore, 0);
    return Number((sum / ordered.length).toFixed(4));
  }, [ordered]);

  return (
    <section>
      <h3>{title}</h3>
      <div>samples {ordered.length}</div>
      <div>avg risk {averageRisk}</div>
      <ol>{ordered.map(formatPoint)}</ol>
    </section>
  );
};
