import { type ChangeEvent, type ReactElement, useMemo } from 'react';
import type { ConvergenceOutput, ConvergenceRunId } from '@domain/recovery-lab-orchestration-core';
import type { ConvergenceStage } from '@domain/recovery-lab-orchestration-core';

interface PanelProps {
  readonly output: ConvergenceOutput | null;
  readonly stageTrail: readonly ConvergenceStage[];
  readonly manifestCount: number;
  readonly onAction: (command: { readonly command: 'reset' | 'jump'; readonly payload?: string }) => void;
}

type MetricKind = 'score' | 'confidence' | 'noise';

interface Metric {
  readonly kind: MetricKind;
  readonly label: string;
  readonly value: number;
  readonly range: [number, number];
}

interface Row {
  readonly left: string;
  readonly right: string;
}

const metricSeed = (seed: string): number => {
  const value = seed
    .split('')
    .reduce((acc, char) => acc + char.codePointAt(0)!, 0);
  return value / Math.max(1, seed.length);
};

const buildMetric = (output: ConvergenceOutput): Metric[] => {
  const score = output.score;
  const confidence = output.confidence;
  const noise = metricSeed(output.runId);
  return [
    {
      kind: 'score',
      label: 'signal score',
      value: Number((score * 100).toFixed(2)),
      range: [0, 100],
    },
    {
      kind: 'confidence',
      label: 'confidence',
      value: Number((confidence * 100).toFixed(2)),
      range: [0, 100],
    },
    {
      kind: 'noise',
      label: 'entropy',
      value: Number((noise % 100).toFixed(2)),
      range: [0, 100],
    },
  ];
};

const buildRows = (diagnostics: readonly string[]): readonly Row[] =>
  diagnostics
    .slice(0, 12)
    .map((entry, index) => ({
      left: `${index + 1}`,
      right: entry,
    }));

export const RecoveryLabConvergencePanel = ({ output, stageTrail, manifestCount, onAction }: PanelProps): ReactElement => {
  const matrix = useMemo(() => {
    const map = new Map<string, { readonly count: number; readonly stages: string[] }>();
    for (const stage of stageTrail) {
      const key = stage.substring(0, 3);
      const current = map.get(key);
      map.set(
        key,
        current
          ? {
              count: current.count + 1,
              stages: [...current.stages, stage],
            }
          : { count: 1, stages: [stage] },
      );
    }

    return [...map.entries()]
      .map(([key, value]) => `${key}:${value.count}->${value.stages.join(',')}`)
      .toSorted();
  }, [stageTrail]);

  const runId = useMemo((): ConvergenceRunId | 'n/a' => output?.runId ?? 'n/a', [output]);

  const diagnosticsRows = useMemo(() => buildRows(output?.diagnostics ?? []), [output?.diagnostics]);
  const metrics = useMemo(() => (output ? buildMetric(output) : []), [output]);
  const selected = useMemo(() => {
    if (!output) {
      return [] as readonly string[];
    }

    return output.selectedRunbooks
      .slice(0, 6)
      .map((entry) => `${entry.ownerTeam}:${entry.name}`);
  }, [output?.selectedRunbooks]);

  const handleJump = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    onAction({ command: 'jump', payload: value });
  };

  const rangeBars = useMemo(() => {
    return metrics.map((metric) => {
      const width = Math.max(0, Math.min(100, metric.value));
      return {
        ...metric,
        width,
      };
    });
  }, [metrics]);

  return (
    <section className="recovery-lab-convergence-panel">
      <header>
        <h2>Convergence panel</h2>
        <p>run id: {runId}</p>
        <p>manifest count: {manifestCount}</p>
      </header>
      <article>
        <h3>stage matrix</h3>
        <ul>
          {matrix.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </article>
      <article>
        <h3>runbook picks</h3>
        <ul>
          {selected.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </article>
      <article>
        <h3>metrics</h3>
        <div>
          {rangeBars.map((metric) => (
            <label key={metric.kind}>
              {metric.label}
              <progress max={metric.range[1]} value={metric.value} />
              <span>
                {metric.width.toFixed(2)} / {metric.range[1]}
              </span>
            </label>
          ))}
        </div>
      </article>
      <article>
        <h3>diagnostics</h3>
        <ol>
          {diagnosticsRows.map((entry) => (
            <li key={`${entry.left}-${entry.right}`}>
              <strong>{entry.left}</strong>
              <span>{entry.right}</span>
            </li>
          ))}
        </ol>
      </article>
      <article>
        <h3>diagnostic jump</h3>
        <select defaultValue="" onChange={handleJump}>
          <option value="">select stage</option>
          {stageTrail.map((stage, index) => (
            <option value={`${stage}-${index}`} key={`${stage}-${index}`}>
              {stage}
            </option>
          ))}
        </select>
      </article>
      <div>
        <button type="button" onClick={() => onAction({ command: 'reset' })}>
          clear panel
        </button>
      </div>
    </section>
  );
};
