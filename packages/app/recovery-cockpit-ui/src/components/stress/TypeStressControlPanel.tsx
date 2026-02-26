import { type FC, useMemo, useState } from 'react';
import { orchestrateStressRuns } from '@service/recovery-stress-lab-orchestrator';
import type { RouteTupleLike } from '@shared/type-level/stress-recursive-constraint-lattice';

export type ControlCase = {
  readonly label: string;
  readonly route: RouteTupleLike;
  readonly raw: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
};

type ControlProps = {
  readonly tenantId: string;
  readonly commands: readonly ControlCase[];
  readonly onSelect: (command: ControlCase) => void;
};

type ControlState = 'idle' | 'running' | 'stopped' | 'succeeded';

const toSeverityWeight = (severity: ControlCase['severity']): number => {
  switch (severity) {
    case 'low':
      return 1;
    case 'medium':
      return 3;
    case 'high':
      return 7;
    case 'critical':
      return 11;
    default:
      return 0;
  }
};

const eventTag = (route: RouteTupleLike): string => {
  const [, action, scope] = route.split('/') as [string, string, string];
  if (!scope) {
    return 'none';
  }
  if (action === 'bootstrap') {
    return `bootstrap:${scope}`;
  }
  if (action === 'simulate') {
    return `simulate:${scope}`;
  }
  return `${action}:${scope}`;
};

const parseRoute = (route: RouteTupleLike): {
  readonly raw: RouteTupleLike;
  readonly domain: string;
  readonly action: string;
  readonly scope: string;
  readonly domainProfile: {
    readonly scope: string;
    readonly tier: number;
    readonly criticality: 'low' | 'medium' | 'high' | 'critical';
  };
  readonly actionProfile: {
    readonly stage: string;
    readonly weight: number;
  };
} =>
  ({
    raw: route,
    domain: 'atlas',
    action: 'bootstrap',
    scope: 'seed',
    domainProfile: {
      scope: 'catalog',
      tier: 1,
      criticality: 'low',
    },
    actionProfile: {
      stage: 'begin',
      weight: 1,
    },
});

const buildPayloadRows = (commands: readonly ControlCase[]): ReadonlyArray<{
  command: string;
  severityWeight: number;
  route: string;
}> =>
  commands.map((command) => ({
    command: command.label,
    severityWeight: toSeverityWeight(command.severity),
    route: eventTag(command.route),
  }));

export const TypeStressControlPanel: FC<ControlProps> = ({ tenantId, commands, onSelect }) => {
  const [mode, setMode] = useState<ControlState>('idle');
  const [filter, setFilter] = useState<'all' | 'high' | 'critical'>('all');
  const rows = useMemo(() => buildPayloadRows(commands), [commands]);

  const sorted = useMemo(() => {
    const selected = filter === 'all'
      ? rows
      : rows.filter((row) => {
        if (filter === 'high') {
          return row.severityWeight >= 7 && row.severityWeight < 11;
        }
        return row.severityWeight >= 11;
      });
    return selected
      .slice()
      .sort((left, right) => right.severityWeight - left.severityWeight);
  }, [rows, filter]);

  const summary = useMemo(() => {
    const total = rows.reduce((acc, row) => acc + row.severityWeight, 0);
    const routeText = rows.map((row) => row.route).join('|');
    return { total, routeText };
  }, [rows]);

  const runOrchestrations = async () => {
    setMode('running');
    try {
      const prepared = commands.map((command) => ({
        id: `${tenantId}-${command.label}-${Date.now()}`,
        route: command.route,
        tenantId,
        namespace: 'recovery-stress-lab',
        command: command.route,
        createdAt: Date.now(),
      }));
      const context = { namespace: commandContext(tenantId), source: 'ui' };
      await orchestrateStressRuns(prepared, context as never);
      setMode('succeeded');
    } catch {
      setMode('stopped');
    }
  };

  const totalCritical = rows.filter((entry) => entry.severityWeight >= 11).length;

  return (
    <section style={{ padding: 12, border: '1px dashed #445', borderRadius: 8 }}>
      <header>
        <h3>Type Stress Control Panel</h3>
        <div style={{ marginBottom: 8 }}>
          route payload total: {summary.total}
        </div>
      </header>
      <div>
        <strong>status</strong>
        {' '}
        <span>{mode}</span>
        {' '}
        <button type="button" onClick={() => setMode((state) => (state === 'idle' ? 'running' : 'idle'))}>
          toggle
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <label htmlFor="stress-severity-filter">filter:</label>
        <select id="stress-severity-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="all">all</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <span style={{ marginLeft: 8 }}>critical: {totalCritical}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" onClick={runOrchestrations}>
          execute {commands.length} run(s)
        </button>
        <button type="button" onClick={() => onSelect(commands[0] ?? { label: 'seed', route: 'atlas/bootstrap/seed', raw: 'atlas/bootstrap/seed', severity: 'low' })}>
          select first
        </button>
      </div>
      <ul style={{ marginTop: 8 }}>
      {sorted.map((row) => {
          const source = (commands.find((command) => command.label === row.command)?.route as RouteTupleLike) ?? 'atlas/bootstrap/seed';
          const resolved = parseRoute(source);
          return (
            <li key={row.command} style={{ fontSize: 12 }}>
              {row.command}
              {' '}
              ·
              {row.route}
              {' '}
              ·
              {resolved.domain}:{resolved.action}
              {' '}
              ·
              {row.severityWeight}
            </li>
          );
        })}
      </ul>
      <p style={{ fontSize: 12, opacity: 0.75 }}>
        {summary.routeText}
      </p>
    </section>
  );
};

const commandContext = (tenantId: string) => `${tenantId}-ctl`;
