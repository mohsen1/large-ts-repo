import { useMemo, useState } from 'react';
import { TypeStressControlPanel, type ControlCase } from '../components/stress/TypeStressControlPanel';
import { useTypeStressControlHarness } from '../hooks/useTypeStressControlHarness';
import { type RouteTupleLike } from '@shared/type-level/stress-recursive-constraint-lattice';
import { createConstraintTuple, runStressLabFactory } from '@service/recovery-stress-lab-orchestrator';

const defaultRoutes: readonly RouteTupleLike[] = [
  'atlas/bootstrap/seed',
  'drill/simulate/loop',
  'mesh/stabilize/zone',
  'risk/verify/closure',
  'quantum/observe/trace',
];

const controlCases = (tenantId: string) =>
  defaultRoutes.map((route, index) => ({
    label: `case-${tenantId}-${index}`,
    route,
    raw: route,
    severity:
      (index % 4 === 0
        ? 'low'
        : index % 4 === 1
          ? 'medium'
          : index % 4 === 2
            ? 'high'
            : 'critical') as 'low' | 'medium' | 'high' | 'critical',
  }));

const aggregate = (values: readonly number[]): number => {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
  }
  return total;
};

export const RecoveryCockpitTypeStressOrchestratorPage = () => {
  const { search, setSearch, selected, setSelected, commands, criticalCount, hasCritical } = useTypeStressControlHarness();
  const [tenantId, setTenantId] = useState('tenant-stress-lab');
  const [executed, setExecuted] = useState(0);
  const cases = useMemo(() => controlCases(tenantId), [tenantId]);

  const severityCounts = useMemo(() => {
    const initial = { low: 0, medium: 0, high: 0, critical: 0 };
    return commands.reduce(
      (acc, command) => {
        if (command.mode === 'bootstrap') {
          acc.low += 1;
        } else if (command.mode === 'simulate') {
          acc.medium += 1;
        } else if (command.mode === 'stabilize') {
          acc.high += 1;
        } else {
          acc.critical += 1;
        }
        return acc;
      },
      { ...initial },
    );
  }, [commands]);

  const weighted = aggregate([
    severityCounts.low * 1,
    severityCounts.medium * 3,
    severityCounts.high * 7,
    severityCounts.critical * 11,
  ]);

  const tuplePreview = createConstraintTuple('bootstrap', 'bootstrap');
  const preview = `${tuplePreview.values[0]}:${tuplePreview.values[1]}`;

  const onSelect = (route: ControlCase) => {
    const nextState = { ...selected, ...route };
    setSelected({
      ...selected,
      label: nextState.label,
      route: nextState.route,
      routeTokens: nextState.route.split('/') as [string, string, string],
      severity: nextState.severity,
    });
    setExecuted((count) => count + 1);
    void runStressLabFactory(
      {
        tenantId,
        namespace: 'recovery-stress-lab',
        command: route.route,
      },
      { namespace: tenantId },
      'prod:interactive:console',
    );
  };

  const filteredCases = useMemo(() => {
    const query = search.toLowerCase();
    return query
      ? cases.filter((entry) => entry.label.includes(query) || entry.route.includes(query))
      : cases;
  }, [cases, search]);

  return (
    <main style={{ padding: 18, color: '#eef2ff', background: 'linear-gradient(140deg,#081021,#112042)' }}>
      <h1>Type Stress Orchestrator</h1>
      <section style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label>
          tenant:
          <input
            style={{ marginLeft: 8 }}
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            placeholder="tenant"
          />
        </label>
        <label>
          search:
          <input
            style={{ marginLeft: 8 }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="filter"
          />
        </label>
      </section>
      <section style={{ marginBottom: 12 }}>
        <strong>stats:</strong>
        {' '}
        controls=
        {weighted}
        {' '}
        critical=
        {criticalCount}
        {' '}
        executed=
        {executed}
        {' '}
        preview=
        {preview}
        {' '}
        hasCritical=
        {String(hasCritical)}
      </section>
      <section style={{ marginBottom: 12 }}>
        <div>selected: {selected.label}</div>
        <div>active route: {selected.route}</div>
      </section>
      <TypeStressControlPanel
        tenantId={tenantId}
        commands={filteredCases}
        onSelect={onSelect}
      />
      <section style={{ marginTop: 12 }}>
        <h3>Route candidates</h3>
        <ul>
          {cases.map((caseItem) => (
            <li key={caseItem.label}>
              {caseItem.label}
              {' '}
              ·
              {' '}
              {caseItem.route}
              {' '}
              ·
              {caseItem.severity}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
