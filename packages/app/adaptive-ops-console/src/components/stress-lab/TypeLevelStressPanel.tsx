import { useMemo } from 'react';
import type { SyntheticPlannerFactory, SyntheticRouteRecord } from '@domain/recovery-lab-synthetic-orchestration';
import { compileSyntheticRoutes } from '@domain/recovery-lab-synthetic-orchestration';
import { buildRecursiveChain } from '@domain/recovery-lab-stress-lab-core';
import type { StressCommand } from '@shared/type-level';

interface TypeLevelStressPanelProps {
  readonly title: string;
  readonly planner: SyntheticPlannerFactory;
  readonly commands: readonly StressCommand[];
}

type SignalCell = {
  readonly id: string;
  readonly domain: string;
  readonly severity: string;
};

const formatCell = (row: SignalCell): string => `${row.id} • ${row.domain} • ${row.severity}`;

export const TypeLevelStressPanel = ({ title, planner, commands }: TypeLevelStressPanelProps) => {
  const topology = planner.seed.topology;
  const records = useMemo(() => {
    const compiled = compileSyntheticRoutes(
      commands,
      topology,
    );
    const chains = buildRecursiveChain(commands.length);
    const routeRows = compiled.records
      .map<SyntheticRouteRecord>((record) => record)
      .slice(0, 20)
      .map((record) => ({ ...record }));
    return {
      topologySignature: compiled.topologySignature,
      chainType: Array.isArray(chains),
      routeRows,
    };
  }, [commands, topology, planner.seed.command]);

  const rows = useMemo(
    () =>
      topology.nodes.slice(0, 5).map(
        (node): SignalCell => ({
          id: node.id,
          domain: node.ownerTeam ?? 'unassigned',
          severity: node.active ? 'active' : 'inactive',
        }),
      ),
    [topology.nodes],
  );

  return (
    <section className="type-level-stress-panel">
      <header>
        <h2>{title}</h2>
        <p>{planner.namespace}</p>
      </header>
      <p>Topology signature: {records.topologySignature}</p>
      <p>Route type chain: {String(records.chainType)}</p>
      <ul className="type-level-nodes">
        {rows.map((row) => (
          <li key={`${row.id}:${row.domain}`}>{formatCell(row)}</li>
        ))}
      </ul>
      <ul className="type-level-routes">
        {records.routeRows.map((route) => (
          <li key={route.id}>
            {route.id} · {route.command} · {route.route}
          </li>
        ))}
      </ul>
    </section>
  );
};
