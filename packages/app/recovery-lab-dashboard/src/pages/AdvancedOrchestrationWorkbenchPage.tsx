import { useMemo, useState } from 'react';
import { AdvancedTimelinePanel } from '../components/orchestration/AdvancedTimelinePanel';
import { RegistryOverviewPanel } from '../components/orchestration/RegistryOverviewPanel';
import { RunbookExecutionPanel } from '../components/orchestration/RunbookExecutionPanel';
import { useAdvancedScenarioPlan } from '../hooks/useAdvancedScenarioPlan';
import { useOrchestrationDiagnostics } from '../hooks/useOrchestrationDiagnostics';
import { useScenarioRunbook } from '../hooks/useScenarioRunbook';
import { buildTemplateBlueprints, type BlueprintTemplate } from '../services/advancedTemplateService';
import {
  buildStudioBlueprint,
  readBlueprintDigest,
  executeAdvancedPlan,
} from '../services/advancedStudioService';
import { collectFilteredPipeline, mapPipelineOutput } from '@shared/stress-lab-runtime/iterative-pipeline';
import { canonicalRuntimeNamespace } from '@shared/stress-lab-runtime/advanced-lab-core';

interface AdvancedOrchestrationWorkbenchPageProps {
  readonly tenant: string;
}

export const AdvancedOrchestrationWorkbenchPage = ({ tenant }: AdvancedOrchestrationWorkbenchPageProps) => {
  const scenario = useAdvancedScenarioPlan(tenant, 4);
  const diagnostics = useOrchestrationDiagnostics(tenant);
  const runbook = useScenarioRunbook(tenant);

  const templates = useMemo(() => buildTemplateBlueprints(tenant, 4), [tenant]);

  const [selectedScenario, setSelectedScenario] = useState(templates[0]?.scenarioId ?? 'default');
  const activeTemplate = useMemo(() => templates.find((item) => item.scenarioId === selectedScenario), [selectedScenario, templates]);

  const blueprintDigest = useMemo(() => {
    if (!activeTemplate) {
      return null;
    }
    const blueprintInput = {
      tenantId: tenant,
      namespace: activeTemplate.namespace,
      scenarioId: activeTemplate.scenarioId,
      graphSteps: runbook.runbookSteps,
    };
    return readBlueprintDigest(buildStudioBlueprint(blueprintInput));
  }, [tenant, activeTemplate, runbook.runbookSteps]);

  const filteredSteps = useMemo(
    () => collectFilteredPipeline(scenario.planSteps, (step) => step.length > 0),
    [scenario.planSteps],
  );
  const mappedDigestLines = useMemo(
    () => mapPipelineOutput(filteredSteps, (entry) => `${entry}`).join('\n'),
    [filteredSteps],
  );

  const runDiagnostics = async () => {
    await diagnostics.runDiagnostics();
    setSelectedScenario(templates[0]?.scenarioId ?? selectedScenario);
  };

  const runWorkflow = async () => {
    await executeAdvancedPlan({
      tenantId: tenant,
      namespace: activeTemplate?.namespace ?? canonicalRuntimeNamespace('prod:interactive:console'),
      scenarioId: selectedScenario,
      graphSteps: runbook.runbookSteps,
    });
  };

  return (
    <main style={{ display: 'grid', gap: 12, padding: 12 }}>
      <header>
        <h1>Advanced Orchestration Workbench</h1>
        <p>Tenant: {tenant}</p>
      </header>

      <section style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="template-picker">Template</label>
        <select
          id="template-picker"
          value={selectedScenario}
          onChange={(event) => setSelectedScenario(event.currentTarget.value)}
        >
          {templates.map((template: BlueprintTemplate) => (
            <option key={template.scenarioId} value={template.scenarioId}>
              {template.scenarioId}
            </option>
          ))}
        </select>
        <div>
          <button type="button" onClick={runDiagnostics}>Run diagnostics</button>
          <button type="button" onClick={runWorkflow} style={{ marginLeft: 8 }}>
            Run workflow
          </button>
          <button type="button" onClick={() => void scenario.refreshTemplates()} style={{ marginLeft: 8 }}>
            Refresh templates
          </button>
          <button
            type="button"
            onClick={() => {
              scenario.runContextRun();
            }}
            style={{ marginLeft: 8 }}
          >
            Build context route
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RegistryOverviewPanel
          tenant={tenant}
          namespace={activeTemplate?.namespace ?? canonicalRuntimeNamespace('prod:interactive:console')}
          steps={runbook.runbookInput.graphSteps}
        />
        <RunbookExecutionPanel tenantId={tenant} lease={scenario.lease} />
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>Blueprint digest</h2>
        <pre>{blueprintDigest ?? 'none'}</pre>
        <p>template lines: {mappedDigestLines}</p>
        <p>template count: {templates.length}</p>
        <p>is ready: {scenario.isReady ? 'yes' : 'no'}</p>
      </section>

      <AdvancedTimelinePanel
        tenant={tenant}
        namespace={activeTemplate?.namespace ?? canonicalRuntimeNamespace('prod:interactive:console')}
        timeline={diagnostics.sequence}
        pipelineRecords={[]}
        onFilter={(marker) => {
          const next = runbook.runbookSteps.find((step) => step.id.includes(marker.id))?.id;
          void next;
        }}
      />

      <section>
        <h2>Diagnostics</h2>
        <p>{diagnostics.text || 'No diagnostics'}</p>
        <p>error={diagnostics.error ?? 'none'} ready={String(diagnostics.isReady)}</p>
      </section>
    </main>
  );
};
