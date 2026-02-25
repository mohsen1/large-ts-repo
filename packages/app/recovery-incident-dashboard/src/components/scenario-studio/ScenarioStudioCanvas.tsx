import { useMemo } from 'react';
import type { ScenarioRunSnapshot, ScenarioTemplate, ScenarioStudioInput } from '../../types/scenario-studio';
import { buildStageMatrix, formatDuration } from '../../components/scenario-studio/ScenarioStudioCanvas.helpers';

interface ScenarioStudioCanvasProps {
  template: ScenarioTemplate | null;
  runs: readonly ScenarioRunSnapshot[];
  onStart: (input: ScenarioStudioInput) => void;
}

export function ScenarioStudioCanvas({ template, runs, onStart }: ScenarioStudioCanvasProps) {
  const matrix = useMemo(() => {
    if (!template) {
      return [] as ReturnType<typeof buildStageMatrix>;
    }
    return buildStageMatrix(template.stages.map((stage) => ({
      id: stage.id,
      status: stage.status,
      weight: stage.confidence,
    })));
  }, [template]);

  if (!template) {
    return <p data-testid="scenario-canvas-empty">No template selected.</p>;
  }

  const latestRun = runs[0] ?? null;

  return (
    <section className="scenario-studio-canvas" aria-label="Scenario Studio Canvas">
      <h3>{template.name}</h3>
      <p>{template.description}</p>
      <dl>
        <div>
          <dt>Stages</dt>
          <dd>{template.stages.length}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{template.owner}</dd>
        </div>
        <div>
          <dt>Latest Run</dt>
          <dd>{latestRun?.runId ?? 'not started'}</dd>
        </div>
      </dl>
      <div className="scenario-studio-matrix" role="list" aria-label="Stage matrix">
        {matrix.map((row) => (
          <article key={row.id} role="listitem" className={`stage-${row.id}`}>
            <h4>{row.id}</h4>
            <p>{row.weight.toFixed(2)}</p>
            <progress max={1} value={row.weight} />
            <p>{row.status}</p>
          </article>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onStart({
            templateId: template.id,
            owner: template.owner,
            mode: 'analysis',
            parameters: {
              templateName: template.name,
              stageCount: template.stages.length,
              hasRun: Boolean(latestRun),
            },
          })
        }
      >
        Start analysis run
      </button>
      <p>{latestRun ? `Duration: ${formatDuration(latestRun.durationMs)}` : 'No historical duration.'}</p>
    </section>
  );
}

export default ScenarioStudioCanvas;
