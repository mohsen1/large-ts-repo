import { useMemo } from 'react';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabSignalHeatmapProps {
  workspace: StreamStressLabWorkspace;
}

interface HeatmapCell {
  readonly key: string;
  readonly signalId: string;
  readonly intensity: number;
  readonly title: string;
}

const buildCells = (workspace: StreamStressLabWorkspace): HeatmapCell[] => {
  const counts = new Map<string, number>();
  for (const signal of workspace.runbookSignals) {
    const severity = signal.severity;
    const current = counts.get(severity) ?? 0;
    counts.set(severity, current + 1);
  }

  const classes = new Map<string, number>();
  for (const signal of workspace.runbookSignals) {
    const current = classes.get(signal.class) ?? 0;
    classes.set(signal.class, current + 1);
  }

  const out: HeatmapCell[] = [];
  let index = 0;
  for (const [severity, count] of counts.entries()) {
    out.push({
      key: `severity-${severity}`,
      signalId: `severity-${index}`,
      intensity: count,
      title: `${severity}: ${count}`,
    });
    index += 1;
  }
  for (const [signalClass, count] of classes.entries()) {
    out.push({
      key: `class-${signalClass}`,
      signalId: `class-${index}`,
      intensity: count,
      title: `${signalClass}: ${count}`,
    });
    index += 1;
  }
  return out;
};

const intensityClass = (intensity: number): string => {
  if (intensity >= 6) return 'high';
  if (intensity >= 3) return 'mid';
  return 'low';
};

export function StressLabSignalHeatmap({ workspace }: StressLabSignalHeatmapProps) {
  const cells = useMemo(() => buildCells(workspace), [workspace.runbookSignals]);

  return (
    <section>
      <h3>Signal Heatmap</h3>
      <p>Signals: {workspace.runbookSignals.length}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8 }}>
        {cells.map((entry) => (
          <article
            key={entry.signalId}
            style={{
              border: `2px solid ${intensityClass(entry.intensity) === 'high' ? '#b33' : intensityClass(entry.intensity) === 'mid' ? '#9a6' : '#69b'}`,
              borderRadius: 6,
              padding: 8,
            }}
          >
            <strong>{entry.signalId}</strong>
            <p>{entry.title}</p>
            <p>Intensity {entry.intensity}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
