import { useMemo } from 'react';
import type { SimulationResult } from '@domain/recovery-scenario-lens';
import { timelineFromResult } from '@domain/recovery-scenario-lens';

interface SynthesisReadinessBoardProps {
  readonly simulation?: SimulationResult;
}

export const SynthesisReadinessBoard = ({ simulation }: SynthesisReadinessBoardProps) => {
  const report = useMemo(() => (simulation ? timelineFromResult(simulation) : undefined), [simulation]);

  return (
    <section className="synthesis-readiness-board">
      <h3>Simulation readiness</h3>
      {report ? (
        <article>
          <p>scenario={report.scenarioId}</p>
          <p>peakConcurrency={report.peakConcurrency}</p>
          <p>completion={Number(report.completion).toFixed(2)}</p>
          <ul>
            {report.segments.slice(0, 12).map((segment) => (
              <li key={segment.label}>
                {segment.label}: {segment.points.length} events
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <p>No simulation loaded</p>
      )}
    </section>
  );
};
