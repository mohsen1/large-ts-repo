import { memo, useMemo } from 'react';
import type { ScenarioTemplate, ScenarioRunSnapshot } from '../../types/scenario-studio';
import { filterTemplatesByKind } from '../../hooks/scenario-studio/useScenarioPlan';
import { useScenarioDiagnostics } from '../../hooks/scenario-studio/useScenarioDiagnostics';
import { useScenarioStudioModel } from '../../services/scenario-studio/scenarioStudioService';

export interface ScenarioStudioOverviewProps {
  readonly templates: readonly ScenarioTemplate[];
  readonly runs: readonly ScenarioRunSnapshot[];
}

export const ScenarioStudioOverview = memo(function ScenarioStudioOverview({ templates, runs }: ScenarioStudioOverviewProps) {
  const latest = runs[0];
  const model = useScenarioStudioModel(templates);
  const { state } = useScenarioDiagnostics(
    model.templates.map((template) => ({
      templateId: template.id,
      owner: 'overview',
      mode: 'analysis',
      parameters: { stageCount: template.stages.length },
    })),
  );

  const kindBuckets = useMemo(() => {
    const allKinds = new Set<string>();
    for (const template of templates) {
      for (const stage of template.stages) {
        allKinds.add(stage.kind);
      }
    }
    return [...allKinds];
  }, [templates]);

  const analysisTemplates = filterTemplatesByKind(templates, 'analysis' as unknown as keyof typeof kindBuckets);

  return (
    <section className="scenario-studio-overview">
      <h2>Scenario Studio Overview</h2>
      <dl>
        <div>
          <dt>Total Templates</dt>
          <dd>{templates.length}</dd>
        </div>
        <div>
          <dt>Total Runs</dt>
          <dd>{runs.length}</dd>
        </div>
        <div>
          <dt>Active Errors</dt>
          <dd>{state.latestErrorCount}</dd>
        </div>
        <div>
          <dt>Average Latency (ms)</dt>
          <dd>{state.averageLatency}</dd>
        </div>
        <div>
          <dt>Latest Template</dt>
          <dd>{latest ? latest.runId : 'none'}</dd>
        </div>
      </dl>
      <p>Templates include kinds: {kindBuckets.join(', ')}</p>
      <p>Analysis set size: {analysisTemplates.length}</p>
      <p>Timeline:
        <ul>
          {state.timeline.slice(0, 8).map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </p>
    </section>
  );
});

export default ScenarioStudioOverview;
