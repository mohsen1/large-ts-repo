import { useMemo, useState } from 'react';
import { asCommandPolicyId } from '@domain/streaming-command-intelligence';
import {
  asCommandTag,
  asSignalBus,
  CommandPlan,
  CommandPolicy,
  CommandNamespace,
  commandNamespaces,
  parseCommandPlan,
} from '@domain/streaming-command-intelligence';
import { useCommandIntelligenceDashboard } from '../hooks/useCommandIntelligenceDashboard';
import { CommandIntelligenceOverview } from '../components/command-intelligence/CommandIntelligenceOverview';
import { CommandIntelligencePolicyFlow } from '../components/command-intelligence/CommandIntelligencePolicyFlow';

const defaultTenant = 'tenant-main';
const defaultStream = 'stream-core-analytics';

const defaultPolicy: CommandPolicy = {
  id: asCommandPolicyId('stream-dashboard-policy'),
  name: 'Default policy',
  priority: 4,
  tags: ['default', 'ui'],
  allowedNamespaces: [...commandNamespaces] as readonly CommandNamespace[],
  requires: [asCommandTag('signal-stream'), asCommandTag('signal-policy')],
  emits: [asSignalBus('command.dashboard'), asSignalBus('command.dashboard.ready')],
  metadata: {
    owner: 'dashboard',
    mode: 'realtime',
  },
};

const planSeed = {
  planId: `seed:${defaultTenant}:${defaultStream}:${Date.now()}`,
  name: `stream-dashboard-page-${defaultStream}`,
  tenantId: defaultTenant,
  streamId: defaultStream,
  plugins: [
    {
      id: 'ui-source',
      name: 'ui-source',
      kind: 'ingest-plugin',
      namespace: 'ingest',
      stepId: 'seed-step-source',
      version: '1.0.0',
      latencyBudgetMs: 30,
      consumes: [asCommandTag('signals.input')],
      emits: [asSignalBus('pipeline.output')],
      config: { role: 'source' },
      input: { source: 'ui', streamId: defaultStream },
      output: { source: 'prepared' },
      behavior: 'echo',
      pluginId: `seed-plugin:source:${defaultTenant}:${defaultStream}`,
    },
    {
      id: 'ui-processor',
      name: 'ui-processor',
      kind: 'analyze-plugin',
      namespace: 'analyze',
      stepId: 'seed-step-processor',
      version: '1.0.0',
      latencyBudgetMs: 40,
      consumes: [asCommandTag('signals.pipeline')],
      emits: [asSignalBus('pipeline.analysis')],
      config: { role: 'processor' },
      input: { source: 'prepared' },
      output: { status: 'processed' },
      behavior: 'augment',
      pluginId: `seed-plugin:processor:${defaultTenant}:${defaultStream}`,
    },
  ],
  expectedDurationMs: 2_000,
  labels: {
    source: 'stream-dashboard-page',
    mode: 'ui',
  },
  config: {
    planType: 'ui',
    requestedAt: new Date().toISOString(),
  },
} as const;

const buildPlan = (): CommandPlan => parseCommandPlan(planSeed);

export const StreamingCommandIntelligencePage = () => {
  const tenantId = defaultTenant;
  const streamId = defaultStream;

  const dashboardState = useCommandIntelligenceDashboard({
    tenantId,
    streamId,
    autoRun: true,
  });

  const [plan] = useState<CommandPlan>(() => buildPlan());

  const policy = useMemo(
    () => ({
      ...defaultPolicy,
      id: asCommandPolicyId(`${tenantId}-${streamId}-policy`),
      name: `UI policy ${tenantId}`,
    }),
    [tenantId],
  );

  const summaryLine = `${Object.keys(dashboardState.summary).length} namespaces`; 

  return (
    <main>
      <h1>Streaming Command Intelligence</h1>
      <p>Tenant: {tenantId}</p>
      <p>Stream: {streamId}</p>
      <p>Summary: {summaryLine}</p>
      <CommandIntelligenceOverview
        streamId={streamId}
        status={dashboardState.status}
        loading={dashboardState.loading}
        namespaces={dashboardState.namespaces}
        envelopes={dashboardState.envelopes}
        summary={dashboardState.summary}
      />
      <CommandIntelligencePolicyFlow
        plan={plan}
        policy={policy}
        onAction={(stepId, action) => {
          void {
            action,
            stepId,
            streamId,
          };
        }}
      />
      <button type="button" onClick={() => void dashboardState.execute()}>
        {dashboardState.loading ? 'Running...' : 'Run command intelligence'}
      </button>
      <p>Runs executed: {dashboardState.runCount}</p>
      {dashboardState.errors.length > 0 ? <p>Errors: {dashboardState.errors.join(' ; ')}</p> : null}
    </main>
  );
};
