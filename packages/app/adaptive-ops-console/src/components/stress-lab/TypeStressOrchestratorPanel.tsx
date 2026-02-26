import type { ReactNode } from 'react';
import {
  type OracleDispatch,
  type StressOracleDomain,
  type StressOracleSeverity,
  type StressOracleSeed,
  seedCatalog,
  normalizedOracleCatalog,
} from '@shared/type-level/stress-conditional-oracle-grid';
import {
  runTopologyDisposal,
  type TopologySummary,
} from '@shared/type-level/stress-modern-disposable-topology';
import {
  hubOrionSeed,
  type HubOrionDispatch,
  type HubOrionDiscriminant,
  type HubOrionResolutionSet,
} from '@shared/type-level-hub';

type PanelSnapshot = {
  readonly scope: StressOracleDomain;
  readonly entity: string;
  readonly verb: string;
  readonly severity: StressOracleSeverity;
  readonly status: string;
  readonly phase: number;
};

type DispatchRow = {
  readonly kind: string;
  readonly status: string;
};

type PanelProps = {
  readonly onRefresh: () => void;
  readonly snapshots: readonly PanelSnapshot[];
  readonly topology: TopologySummary | null;
  readonly dispatches: readonly HubOrionDispatch<string, unknown, HubOrionDiscriminant>[];
  readonly status: string;
  readonly children?: ReactNode;
};

const resolveStatus = (dispatches: PanelProps['dispatches']) => {
  let score = 0;
  const grouped = new Map<string, number>();

  for (const item of dispatches) {
    const bucket = `${item.route.plane}-${item.route.tag}`;
    const next = (grouped.get(bucket) ?? 0) + 1;
    grouped.set(bucket, next);
    if (item.envelope.active) {
      score += 3;
    }
  }

  if (score >= 20) {
    return 'critical';
  }
  if (score >= 12) {
    return 'high';
  }
  if (score >= 8) {
    return 'medium';
  }
  return 'low';
};

const renderRouteRows = (rows: readonly DispatchRow[]) => {
  const grouped: Record<string, number> = {};
  for (const row of rows) {
    grouped[row.kind] = (grouped[row.kind] ?? 0) + 1;
  }
  return Object.entries(grouped).map(([kind, count]) => `${kind}:${count}`).join(', ');
};

const routeFromSeed = (seed: StressOracleSeed): PanelSnapshot => {
  const [domain, entity, verb, severity, id] = seed.split(':');
  return {
    scope: (domain as StressOracleDomain) ?? 'incident',
    entity,
    verb,
    severity: severity as StressOracleSeverity,
    status: id,
    phase: 0,
  };
};

export const TypeStressOrchestratorPanel = ({
  onRefresh,
  snapshots,
  topology,
  dispatches,
  status,
  children,
}: PanelProps) => {
  const rows = snapshots.map((entry) => ({
    kind: entry.scope,
    status: `${entry.verb} ${entry.entity}`,
  }));

  const rowsText = renderRouteRows(rows);
  const health = resolveStatus(dispatches);

  return (
    <section className="type-stress-orchestrator-panel">
      <header>
        <h3>Type Stress Orchestrator</h3>
        <p>{status}</p>
      </header>
      <div>
        <p>Oracle stage count: {snapshots.length}</p>
        <p>Topology nodes: {topology?.size ?? 0}</p>
        <p>Routing health: {health}</p>
      </div>
      <pre>{rowsText}</pre>
      <div>
        <button type="button" onClick={onRefresh}>
          Refresh orchestration
        </button>
      </div>
      <div>
        <ul>
          {hubOrionSeed.map((entry) => (
            <li key={`${entry.scope}-${entry.verb}`}>{entry.scope}:{entry.verb}</li>
          ))}
        </ul>
      </div>
      <div>
        <p>Catalog sample: {normalizedOracleCatalog.catalog.length}</p>
      </div>
      <div>{dispatches.length}</div>
      {children}
    </section>
  );
};

export const TypeStressOrchestratorPanelBootstrap = async (): Promise<TopologySummary | null> => {
  try {
    return await runTopologyDisposal(seedCatalog);
  } catch {
    return null;
  }
};

export const routeRows = seedCatalog.map(routeFromSeed);
export type RenderRoute = OracleDispatch<StressOracleSeed, StressOracleSeed>;

export const summarizeHubResolution = (profile: HubOrionResolutionSet<Readonly<typeof hubOrionSeed>>) => {
  const total = profile.tuples.length;
  return `hub-route-plan:${total}:${profile.dispatch.plane}`;
};
