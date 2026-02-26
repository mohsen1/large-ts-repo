import { type FC, useMemo, useState } from 'react';
import type { StressWorkbenchPayload, StressScenarioState } from '../../hooks/useRecoveryStressWorkbench';

type PanelProps = {
  readonly payload: StressWorkbenchPayload;
};

const stateBadge = (state: StressScenarioState): string => {
  return {
    idle: 'gray',
    warming: 'gold',
    active: 'green',
    exhausted: 'crimson',
  }[state];
};

const classifyCommand = (payload: StressWorkbenchPayload['plans'][number]): string => {
  if (!payload || !payload.command) {
    return 'none';
  }
  return payload.command === 'bootstrap'
    ? 'control'
    : payload.command === 'schedule'
      ? 'queue'
      : payload.command === 'preheat'
        ? 'warm'
        : payload.command === 'execute'
          ? 'run'
          : payload.command === 'contain'
            ? 'guard'
            : payload.command === 'restore'
              ? 'recover'
              : payload.command === 'finalize'
                ? 'close'
                : 'generic';
};

const complexity = (payload: StressWorkbenchPayload): number => {
  const events = payload.activeEvents;
  let total = 0;
  for (const event of events) {
    const isCritical = event.state === 'active' || event.state === 'warming';
    const phaseScore = event.phase >= 10 ? 4 : event.phase >= 5 ? 2 : 1;
    const eventBonus = event.event === 'simulate' || event.event === 'triage' || event.event === 'restore' ? 5 : 2;
    total += (isCritical ? 3 : 1) * phaseScore + eventBonus;
  }

  return total;
};

const eventLabel = (event: StressWorkbenchPayload['activeEvents'][number]): string => {
  const route = event.route || '';
  const [segment0, segment1, segment2] = route.split('/');
  switch (segment2) {
    case 'active':
      return `${segment1} now running`;
    case 'new':
      return `${segment1} staged`;
    case 'pending':
      return `${segment1} waiting`;
    case 'warming':
      return `${segment1} heating`;
    case 'degraded':
      return `${segment1} unstable`;
    case 'recovering':
      return `${segment1} healing`;
    case 'terminated':
      return `${segment1} ended`;
    case 'final':
      return `${segment1} completed`;
    default:
      return `${segment1} unknown`;
  }
};

const metricBadge = (value: number): string =>
  value > 5 ? 'hot'
    : value > 2 ? 'warm'
      : 'cool';

const commandDescription = (command: string): string => {
  return command.includes('execute')
    ? 'active runtime action'
    : command.includes('schedule')
      ? 'queued work'
      : command.includes('preheat')
        ? 'warming stage'
        : command.includes('restore')
          ? 'healing phase'
          : 'finalization';
};

const planStateClass = (planState: StressWorkbenchPayload['result']['resolved'][number]['actionClass']): string => {
  return planState === 'generic' ? 'muted'
    : planState === 'analysis' ? 'blue'
      : planState === 'control' ? 'purple'
        : planState === 'defense' ? 'darkred'
          : planState === 'runtime' ? 'blue'
            : planState === 'runtime' ? 'blue'
              : 'gray';
};

export const StressWorkbenchPanel: FC<PanelProps> = ({ payload }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'warming'>('all');
  const filteredPlans = useMemo(
    () => payload.activeEvents.filter((event) => filter === 'all' ? true : filter === 'active' ? event.state === 'active' : event.state === 'warming'),
    [payload.activeEvents, filter],
  );
  const score = complexity(payload);
  return (
    <section style={{ border: '1px solid #d6d8db', borderRadius: 12, padding: 12, background: '#0b1024', color: '#f5f8ff' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div>
          <h3>Recovery stress cockpit</h3>
          <small>Scenario trend: {payload.evaluation.profile}</small>
        </div>
        <button type="button" onClick={() => setFilter((value) => (value === 'all' ? 'active' : value === 'active' ? 'warming' : 'all'))}>
          Filter: {filter}
        </button>
      </header>
      <div style={{ marginBottom: 8, fontSize: 12 }}>
        tenant: {payload.tenantId} | routes: {payload.metrics.routeCount} | active: {payload.metrics.activeCount}
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ color: stateBadge(payload.state) }}>state={payload.state}</span>
        {' '}
        <span>{`complexity=${score}`}</span>
        {' '}
        <span>{`trend=${metricBadge(score)}`}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>Evaluations</strong>
        <div>resolved={payload.result.resolved.length}</div>
        <div>latency={payload.metrics.averageLatency.toFixed(2)}ms</div>
        <div>elapsed={payload.result.elapsedMs}ms</div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {filteredPlans.map((event) => {
          const routeLabel = eventLabel(event);
          return (
            <article key={`${event.route}-${event.phase}`} style={{ border: '1px dashed #5c6578', borderRadius: 8, padding: 8 }}>
              <div>{routeLabel}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {planStateClass(event.event as unknown as StressWorkbenchPayload['result']['resolved'][number]['actionClass'])}
              </div>
            </article>
          );
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        <strong>Command matrix</strong>
        <ul style={{ marginTop: 4, listStyle: 'none', paddingLeft: 0 }}>
          {payload.plans.slice(0, 8).map((plan) => {
            const cls = classifyCommand(plan);
            const commandText = commandDescription(plan.command);
            return (
              <li key={`${plan.command}-${plan.domainAffinity}`}>
                {plan.command} / {cls} / {commandText} / {plan.executionPhase}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
