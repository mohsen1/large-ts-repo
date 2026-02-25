import { useMemo } from 'react';
import type { ScenarioTemplate, ScenarioStageSpec, ScenarioRunSnapshot } from '../../types/scenario-studio';
import { normalizeWeights } from '../../components/scenario-studio/ScenarioStudioCanvas.helpers';

export interface ScenarioPlanInspectorProps {
  template: ScenarioTemplate | null;
  run: ScenarioRunSnapshot | null;
}

function summarizeKinds(stages: readonly ScenarioStageSpec[]) {
  const counts = new Map<string, number>();
  for (const stage of stages) {
    counts.set(stage.kind, (counts.get(stage.kind) ?? 0) + 1);
  }
  return [...counts.entries()].map(([kind, count]) => ({ kind, count }));
}

export function ScenarioPlanInspector({ template, run }: ScenarioPlanInspectorProps) {
  const kinds = useMemo(() => summarizeKinds(template?.stages ?? []), [template]);
  const normalized = useMemo(() => normalizeWeights(template?.stages ?? []), [template]);

  if (!template) {
    return <section>No template loaded.</section>;
  }

  return (
    <section className="scenario-inspector">
      <h3>Template Inspector</h3>
      <p>Template {template.name} contains {template.stages.length} stages.</p>
      <div className="kind-list">
        {kinds.map((entry) => (
          <article key={entry.kind}>
            <strong>{entry.kind}</strong> · {entry.count}
          </article>
        ))}
      </div>
      <div>
        <h4>Stage Weights</h4>
        <ul>
          {normalized.map((entry) => (
            <li key={entry.id}>
              {entry.id}: {entry.score.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>
      {run ? (
        <div>
          <h4>Run {run.runId}</h4>
          <p>Mode: {run.mode}</p>
          <p>Duration: {run.durationMs}ms</p>
          <p>State: {run.state}</p>
        </div>
      ) : null}
    </section>
  );
}

export default ScenarioPlanInspector;
