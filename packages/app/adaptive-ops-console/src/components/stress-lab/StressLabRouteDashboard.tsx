import { useMemo, useState } from 'react';
import type { SyntheticRouteRecord, SyntheticTopology } from '@domain/recovery-lab-synthetic-orchestration';
import type { StressCommand, StressDomainUnion, StressVerb } from '@shared/type-level';
import { compileSyntheticRoutes, synthesizePlan } from '@domain/recovery-lab-synthetic-orchestration';

interface RouteDashboardProps {
  readonly commands: readonly StressCommand[];
  readonly namespace: string;
  readonly tenantId: string;
}

type RouteNode = {
  readonly code: string;
  readonly command: StressCommand;
  readonly phase: 'queued' | 'running' | 'done';
};

const buildPath = (command: StressCommand): {
  verb: StressVerb;
  domain: StressDomainUnion;
  severity: string;
} => {
  const [verb, domain, severity] = command.split(':') as [StressVerb, StressDomainUnion, string];
  return { verb, domain, severity };
};

export const StressLabRouteDashboard = ({ commands, namespace, tenantId }: RouteDashboardProps) => {
  const [activePhase, setActivePhase] = useState<'queued' | 'running' | 'done'>('queued');

  const topologyRows = useMemo(() => {
    const compiled = compileSyntheticRoutes(commands, {
      tenantId,
      nodes: [],
      edges: [],
    } as SyntheticTopology);
    return compiled.records
      .map<SyntheticRouteRecord>((record) => record)
      .map((record, index) => ({
        id: record.id,
        command: record.command,
        route: record.route,
        constraints: record.constraints,
        tuple: record.tuple,
      }));
  }, [commands, tenantId]);

  const [summary, routeCount] = useMemo(() => {
    const tuple = compileSyntheticRoutes(commands, {
      tenantId,
      nodes: [],
      edges: [],
    } as SyntheticTopology);
    const path = synthesizePlan({
      tenantId,
      namespace,
      command: commands[0] ?? 'discover:workload:low',
      topology: {
        tenantId,
        nodes: [],
        edges: [],
      },
    });
    return [path.routeProjection, tuple.records.length] as const;
  }, [commands, namespace, tenantId]);

  return (
    <section className="stress-route-dashboard">
      <h3>Route Dashboard</h3>
      <p>{namespace}</p>
      <p>{summary.service}:{summary.entity}</p>
      <p>Routes: {routeCount} · Phase: {activePhase}</p>
      <label>
        Phase
        <select value={activePhase} onChange={(event) => setActivePhase(event.target.value as 'queued' | 'running' | 'done')}>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
        </select>
      </label>
      <ul>
        {topologyRows.map((route, index) => {
          const details = buildPath(route.command);
          return (
            <li key={route.id}>
              <strong>{index + 1}</strong>
              <span> {route.id}</span>
              <span> {details.verb}</span>
              <span> {details.domain}</span>
              <span> {details.severity}</span>
              <span> {route.route}</span>
              <span> phase:{activePhase}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
