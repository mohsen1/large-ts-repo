import { useMemo, useState, type ReactElement } from 'react';
import { PolicyDeck } from '../components/PolicyDeck';
import { SignalHeatmap } from '../components/SignalHeatmap';
import { OrchestrationTimeline } from '../components/OrchestrationTimeline';
import { type OrchestrationPlanOutput, runPlanId, tenantId } from '../domain/models';
import { useRecoveryOrchestrationLab } from '../hooks/useRecoveryOrchestrationLab';
import { buildDemoPlan } from '../services/orchestration-api';
import { inferExecutionOrder } from '../runtime/plugin-types';
import { bootstrapPlugins } from '../runtime/plugin-loader';

const formatStatus = (status: 'idle' | 'running' | 'success' | 'error'): string => {
  const labelByStatus = {
    idle: 'Ready',
    running: 'Running',
    success: 'Done',
    error: 'Failed',
  } satisfies Record<'idle' | 'running' | 'success' | 'error', string>;

  return labelByStatus[status];
};

const mapSummaryToDeck = (
  tenant: string,
  planRunId: string,
  timeline: readonly string[],
): OrchestrationPlanOutput => {
  const [runIdToken, ...directiveNames] = timeline;
  const directives = timeline.map((entry, index) => {
    const [pluginName = `plugin:${index}`] = entry.split(':');
    return {
      name: `policy:${pluginName.slice(0, 24)}:${index}`,
      weight: Number((1 / (index + 1)).toFixed(2)),
      conditions: [tenant, runIdToken, entry],
      controls: [
        {
          service: pluginName,
          action: index % 2 === 0 ? 'scale-up' : 'scale-down',
          priority: index + 1,
        },
      ],
    };
  });

  const selectedRunId = directiveNames[0] ?? planRunId;

  return {
    runId: runPlanId(selectedRunId),
    directives,
    artifacts: [
      {
        tenant: tenantId(tenant),
        runId: runPlanId(planRunId),
        createdAt: new Date().toISOString(),
        checksums: {
          directives: directives.map((entry) => entry.name).join('|'),
          status: String(timeline.length),
        },
      },
    ],
    summary: `directives:${directives.length}`,
  };
};

export function RecoveryOrchestrationLabPage(): ReactElement {
  const tenant = tenantId('tenant-omega');
  const [title, setTitle] = useState('Recovery Orchestration Lab');
  const { state, run, reset, diagnostics } = useRecoveryOrchestrationLab(tenant, title);
  const plan = useMemo(() => buildDemoPlan(tenant, title).plan, [tenant, title]);
  const executionOrder = inferExecutionOrder(bootstrapPlugins.registry);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [focusedStep, setFocusedStep] = useState(0);

  const deckOutput = useMemo(
    () => mapSummaryToDeck(state.tenant, state.summary?.runId ?? plan.runId, state.summary?.timeline ?? []),
    [state.tenant, state.summary, plan.runId],
  );

  const timeline = useMemo(() => {
    const summaryTimeline = state.summary?.timeline;
    const source =
      summaryTimeline && summaryTimeline.length > 0
        ? summaryTimeline
        : executionOrder.map((name) => `${name}:idle`);

    return source.map((entry, index) => {
      const [plugin, status = 'queued'] = entry.split(':');
      const normalizedStatus = status === 'success' ? 'success' : 'skipped';

      return {
        plugin,
        startedAt: new Date(plan.requestedAt).toISOString(),
        elapsedMs: (index + 1) * 25,
        status: normalizedStatus,
      } as const;
    });
  }, [executionOrder, plan.requestedAt, state.summary]);

  const onPolicySelect = (policyName: string) => {
    setSelected((previous) =>
      previous.includes(policyName) ? previous.filter((entry) => entry !== policyName) : [...previous, policyName],
    );
  };

  return (
    <main className="recovery-orchestration-lab-page">
      <header>
        <h1>Recovery Orchestration Lab</h1>
        <p>{formatStatus(state.status)}</p>
      </header>
      <section>
        <button type="button" onClick={run} disabled={state.status === 'running'}>
          {state.status === 'running' ? 'Running…' : 'Run orchestration'}
        </button>
        <button type="button" onClick={reset}>
          Reset diagnostics
        </button>
        <button type="button" onClick={() => setTitle((value) => `${value} · ${Date.now()}`)}>
          Refresh title
        </button>
      </section>
      <section>
        <h2>Execution details</h2>
        <p>Tenant: {state.tenant}</p>
        <p>Run ID: {diagnostics.selectedRunId}</p>
        <p>Directive count: {diagnostics.directiveCount}</p>
        <p>Timeline markers: {diagnostics.timelineLength}</p>
        <p>Plugin order: {executionOrder.join(' → ')}</p>
        {state.error ? <p role="alert">Error: {state.error}</p> : null}
      </section>
      <PolicyDeck title="Active directives" output={deckOutput} selectedPolicies={selected} onSelect={onPolicySelect} />
      <SignalHeatmap tenant={state.tenant} signals={plan.signals} />
      <OrchestrationTimeline
        title="Timeline"
        timeline={timeline}
        activeIndex={Math.min(focusedStep, timeline.length - 1)}
        onSelect={setFocusedStep}
      />
      {state.summary ? (
        <pre>
          {JSON.stringify(
            {
              runId: state.summary.runId,
              directiveCount: state.summary.directiveCount,
              directives: state.summary.directives,
              timeline: state.summary.timeline,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </main>
  );
}
