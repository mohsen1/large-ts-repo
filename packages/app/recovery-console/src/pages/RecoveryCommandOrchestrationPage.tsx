import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { CommandLanguageWorkbench } from '../components/CommandLanguageWorkbench';
import { CommandRiskRadar } from '../components/CommandRiskRadar';
import { CommandSlaTimeline } from '../components/CommandSlaTimeline';
import { useRecoveryCommandOrchestrationStudio } from '../hooks/useRecoveryCommandOrchestrationStudio';
import { InMemoryCommandStore } from '@data/recovery-command-control-plane';
import type { CommandDirective, CommandIntent } from '@domain/recovery-command-language';

const store = new InMemoryCommandStore();

const demoIntents: CommandIntent[] = [
  {
    id: '0ea3db1b-8f5e-4d2d-bf7b-e0abf0f3dd1f',
    label: 'Regional failover drill',
    description: 'Run synthetic regional failover for primary data plane',
    priority: 6,
    confidenceScore: 0.87,
    owner: 'drill-engineering',
    payload: { mode: 'planned', open: true },
    tags: ['failover', 'drill'],
    metadata: {
      sourceService: 'console',
      reasonCode: 'drill-readiness',
      createdAt: new Date().toISOString(),
      requestedBy: 'ops-team',
      expectedImpactMins: 60,
    },
  },
  {
    id: 'f4f58f55-a8a5-4afc-a4c3-1f4a3de1f2b7',
    label: 'SLO policy hardening',
    description: 'Inject temporary policy guard for high-risk workloads',
    priority: 8,
    confidenceScore: 0.92,
    owner: 'policy-team',
    payload: { mode: 'automatic', open: true },
    tags: ['policy', 'stability'],
    metadata: {
      sourceService: 'policy-engine',
      reasonCode: 'sla-maintenance',
      createdAt: new Date().toISOString(),
      requestedBy: 'sre-lead',
      expectedImpactMins: 30,
    },
  },
];

const demoDirectives: CommandDirective[] = [
  {
    commandIntentId: demoIntents[0].id,
    kind: 'approve',
    channel: 'sre-console',
    actor: 'automation',
    payload: { slaWindowMinutes: 15 },
    priorityBand: 'high',
    lifecycle: {
      initiatedAt: new Date().toISOString(),
    },
    rationale: 'Pre-approved by policy, no infra freeze',
  },
  {
    commandIntentId: demoIntents[0].id,
    kind: 'execute',
    channel: 'automation',
    actor: 'runner',
    payload: { slaWindowMinutes: 30 },
    priorityBand: 'high',
    lifecycle: {
      initiatedAt: new Date().toISOString(),
    },
    rationale: 'Execution window aligned with low-traffic',
  },
  {
    commandIntentId: demoIntents[1].id,
    kind: 'approve',
    channel: 'policy-engine',
    actor: 'operator',
    payload: { slaWindowMinutes: 20 },
    priorityBand: 'normal',
    lifecycle: {
      initiatedAt: new Date().toISOString(),
    },
    rationale: 'Policy engine confirms safe boundary set',
  },
];

export function RecoveryCommandOrchestrationPage(): ReactElement {
  const [selected, setSelected] = useState<CommandDirective | null>(null);
  const [state, refresh] = useRecoveryCommandOrchestrationStudio({
    intentSource: async () => demoIntents,
    directiveSource: async () => demoDirectives,
    store,
  });

  const directives = useMemo(() => state.snapshot?.activeDirectives ?? [], [state.snapshot?.activeDirectives]);
  const riskLabels = useMemo(
    () => state.snapshot?.activeDirectives.map((d) => `${d.kind}:${d.actor}`) ?? [],
    [state.snapshot?.activeDirectives],
  );

  return (
    <main>
      <h1>Recovery command orchestration</h1>
      <p>{`Summary: ${state.lastSummary}`}</p>
      <p>{`Submitted: ${state.submittedCount} | Risks: ${riskLabels.length}`}</p>
      <button type="button" onClick={() => void refresh()}>
        Refresh workspace
      </button>
      <button type="button" onClick={() => void undefined} style={{ marginLeft: 8 }}>
        Submit commands
      </button>
      <CommandLanguageWorkbench snapshot={state.snapshot} directives={directives} />
      <CommandRiskRadar snapshot={state.snapshot} decisions={state.decisions} />
      <CommandSlaTimeline
        directives={directives}
        onInspect={(directive) => {
          setSelected(directive);
        }}
      />
      {selected ? <section><h3>Directive inspect</h3><pre>{JSON.stringify(selected, null, 2)}</pre></section> : null}
      {state.error ? <p style={{ color: 'red' }}>{state.error}</p> : null}
    </main>
  );
}
