import { useCallback, useMemo, useState } from 'react';
import {
  seedCatalog,
  type NoiseToken,
  type StressOracleDomain,
  type StressOracleSeed,
  type StressOracleSeverity,
  type StressOracleVerb,
} from '@shared/type-level/stress-conditional-oracle-grid';
import {
  machineBlueprint,
  type BuildMachinePath,
  type TransitionPlan,
} from '@shared/type-level/stress-recursive-state-machines';
import {
  runTopologyDisposal,
  type TopologySummary,
} from '@shared/type-level/stress-modern-disposable-topology';
import {
  type HubOrionDiscriminant,
  type HubOrionDispatch,
  hubOrionSeed,
} from '@shared/type-level-hub';
import {
  buildConstraintLattice,
  createSolverConstraint,
  runSolverConflict,
  type SolverConstraintOutput,
  type SolverPlan,
} from '@shared/type-level/stress-constraint-garden';

type RouteSnapshot = {
  readonly scope: StressOracleDomain;
  readonly entity: string;
  readonly verb: StressOracleVerb;
  readonly severity: StressOracleSeverity;
  readonly noise: NoiseToken;
  readonly id: string;
  readonly status: string;
  readonly phase: number;
};

type OrchestratorStatus = 'boot' | 'running' | 'settled' | 'error';

type SolverTrace = {
  readonly first: string;
  readonly second: string;
  readonly extras: readonly string[];
};

type OrchestratorSnapshot = {
  readonly status: OrchestratorStatus;
  readonly dispatchCount: number;
  readonly activeCount: number;
  readonly machinePlan: BuildMachinePath<16>['length'];
  readonly transitionPlan: TransitionPlan<16>['length'];
  readonly topologySize: number;
  readonly constraintTrace: string;
};

const parseSeed = (seed: StressOracleSeed): RouteSnapshot => {
  const [scope, entity, verb, severity, id] = seed.split(':');
  return {
    scope: scope as StressOracleDomain,
    entity,
    verb: verb as StressOracleVerb,
    severity: severity as StressOracleSeverity,
    noise: (id.length % 10) as NoiseToken,
    id,
    status: `${verb}:${entity}`,
    phase: id.length,
  };
};

const buildSnapshotMap = (seeds: readonly StressOracleSeed[]) =>
  seeds.map((seed) => parseSeed(seed));

const buildDispatches = (): readonly HubOrionDispatch<string, unknown, HubOrionDiscriminant>[] =>
  hubOrionSeed.map((seed, index) => ({
    envelope: {
      kind: `${seed.scope}:${index}` as unknown as HubOrionDispatch<string, unknown, HubOrionDiscriminant>["envelope"]["kind"],
      payload: { domain: seed.scope },
      policy: `policy:${seed.scope}` as const,
      domain: seed.scope,
      active: index % 2 === 0,
    },
    route: seed.scope === 'mesh'
      ? { plane: 'mesh-plane', tag: 'signal' }
      : seed.scope === 'node'
        ? { plane: 'node-plane', tag: 'graph' }
        : { plane: 'incident-plane', tag: 'event' },
  })) as unknown as readonly HubOrionDispatch<string, unknown, HubOrionDiscriminant>[];

const reduceBySeverity = (rows: readonly RouteSnapshot[], levels: readonly StressOracleSeverity[]) => {
  const output: RouteSnapshot[] = [];
  for (const level of levels) {
    for (const row of rows) {
      if (row.severity === level) {
        output.push({ ...row, status: `${row.status}:${level}` });
      }
    }
  }
  return output;
};

const mapByPhase = (rows: readonly RouteSnapshot[]) =>
  rows.map((row, index) => ({ ...row, phase: (row.phase + index) % 100 }));

const sortByDomain = (rows: readonly RouteSnapshot[]) =>
  [...rows].sort((a, b) => a.scope.localeCompare(b.scope));

const foldDispatch = (rows: readonly RouteSnapshot[]) => {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    grouped.set(row.scope, (grouped.get(row.scope) ?? 0) + 1);
  }
  return Array.from(grouped).map((item) => item[0]);
};

export const useTypeStressOrchestrator = () => {
  const [status, setStatus] = useState<OrchestratorStatus>('boot');
  const [rows, setRows] = useState<readonly RouteSnapshot[]>([]);
  const [dispatches, setDispatches] = useState<readonly HubOrionDispatch<string, unknown, HubOrionDiscriminant>[]>([]);
  const [topologySummary, setTopologySummary] = useState<TopologySummary | null>(null);
  const [isRunning, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [solverTrace, setSolverTrace] = useState<SolverTrace>({
    first: 'alpha',
    second: 'beta',
    extras: ['gamma', 'delta'],
  });

  const snapshotRows = useMemo(
    () =>
      reduceBySeverity(
        mapByPhase(sortByDomain(buildSnapshotMap(seedCatalog))),
        ['critical', 'high', 'medium', 'low', 'info'],
      ),
    [],
  );
  const dispatchCatalog = useMemo(() => buildDispatches(), []);

  const topologyRows = useMemo(() => foldDispatch(snapshotRows), [snapshotRows]);

  const constraints = useMemo(() => buildConstraintLattice('alpha'), []);
  const solverOutput = useMemo(() => {
    const left = createSolverConstraint('seed', 'alpha');
    const right = createSolverConstraint('seed', 'alpha');
    const dispatch = runSolverConflict(left, right, { root: left });
    return {
      accepted: [
        {
          input: left,
          path: `${left.name}.collect` as const,
        },
      ],
      blocked: [
        {
          input: right,
          path: `${right.name}.normalize` as const,
        },
      ],
      constraints: {
        collect: {
          verb: `${left.domain}:collect`,
          domain: left.domain,
          level: 1,
        },
        normalize: {
          verb: `${left.domain}:normalize`,
          domain: left.domain,
          level: 2,
        },
        dispatch: {
          verb: `${left.domain}:dispatch`,
          domain: left.domain,
          level: 3,
        },
      } as SolverConstraintOutput<SolverPlan<'seed'>>['constraints'],
    };
  }, []);

  const snapshot = useMemo<OrchestratorSnapshot>(() => {
    return {
      status,
      dispatchCount: dispatchCatalog.length,
      activeCount: dispatchCatalog.filter((item) => item.envelope.active).length,
      machinePlan: machineBlueprint.transitions.length as BuildMachinePath<16>['length'],
      transitionPlan: 0 as TransitionPlan<16>['length'],
      topologySize: topologyRows.length,
      constraintTrace: `${constraints.first}-${solverOutput.accepted.length}-${constraints.extras.length}`,
    };
  }, [constraints, dispatchCatalog.length, status, topologyRows.length, solverOutput.accepted.length]);

  const runOrchestrator = useCallback(async () => {
    setRunning(true);
    setStatus('running');
    setSolverTrace({
      first: solverTrace.first,
      second: solverTrace.second,
      extras: [...solverTrace.extras],
    });
    try {
      const topology = await runTopologyDisposal(seedCatalog);
      setTopologySummary(topology);
      setRows(snapshotRows.map((row) => ({ ...row, status: `${row.status}:refreshed` })));
      setDispatches(dispatchCatalog);
      setRunCount((count) => count + 1);
      setStatus('settled');
    } catch {
      setStatus('error');
    } finally {
      setRunning(false);
    }
  }, [snapshotRows, dispatchCatalog, solverTrace]);

  const clear = useCallback(() => {
    setRows([]);
    setDispatches([]);
    setTopologySummary(null);
    setStatus('boot');
    setRunCount(0);
  }, []);

  return {
    status,
    rows,
    topologySummary,
    topologyRows,
    dispatches,
    snapshot,
    solverTrace,
    runCount,
    runOrchestrator,
    clear,
    isRunning,
    dispatchRows: snapshotRows,
  };
};
