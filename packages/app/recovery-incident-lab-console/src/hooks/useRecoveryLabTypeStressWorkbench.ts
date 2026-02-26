import { evaluateFlow, flowBranches, type BranchContext as ControlFlowBranchContext, type BranchEvent as ControlFlowBranchEvent } from '@shared/type-level/stress-controlflow-lab';
import {
  type GalaxyRoute,
  parseRouteSignature,
  type RouteMap,
  type ChainThen,
  galaxyDispatchMatrix,
  resolveDispatchMatrix,
} from '@shared/type-level/stress-conditional-dispatch-galaxy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BranchContext = ControlFlowBranchContext;
export type FlowBranchState = (typeof flowBranches)[number];
export type BranchEvent = ControlFlowBranchEvent<FlowBranchState>;

type BranchSummary = {
  readonly severity: string;
  readonly branches: readonly WorkbenchFlowBranch[];
  readonly contexts: readonly BranchContextLike[];
  readonly count: number;
};

type WorkbenchFlowBranch = {
  readonly branch: FlowBranchState;
  readonly decision: boolean;
};

type BranchContextLike = {
  readonly path: string;
  readonly index: number;
  readonly opcode: string;
  readonly matched: boolean;
};

interface State {
  readonly selected: number;
  readonly route: string;
  readonly map: Map<string, string>;
  readonly resolved: readonly RouteMap<GalaxyRoute>[];
  readonly branch: readonly BranchEvent[];
  readonly timeline: string[];
}

const initialRoute = galaxyDispatchMatrix[0] ?? ('/discover/incident/critical/id-alpha' as GalaxyRoute);

const baseState: State = {
  selected: 0,
  route: initialRoute,
  map: new Map<string, string>(),
  resolved: [],
  branch: [] as readonly BranchEvent[],
  timeline: [],
};

const inferSeverity = (route: string): string => {
  const parsed = parseRouteSignature(route as GalaxyRoute);
  return parsed.severity;
};

const buildFlowBranches = (route: string, routeIndex: number): readonly WorkbenchFlowBranch[] => {
  const branches = [...flowBranches] as readonly FlowBranchState[];
  return branches.map((entry, index) => ({
    branch: entry,
    decision: routeIndex > 0 && index === routeIndex % branches.length,
  }));
};

const branchFromContext = (branches: readonly WorkbenchFlowBranch[], route: string): readonly BranchContextLike[] =>
  branches.map((branch, index) => ({
    path: `${branch.branch}-${route.split('/').join('.')}`,
    index,
    opcode: branch.branch,
    matched: branch.decision,
  }));

export const useRecoveryLabTypeStressWorkbench = () => {
  const [state, setState] = useState<State>(baseState);
  const stack = useRef(new AsyncDisposableStack());

  const reset = useCallback(() => {
    setState(baseState);
  }, []);

  const next = useCallback(() => {
    setState((current) => {
      const selected = (current.selected + 1) % galaxyDispatchMatrix.length;
      return {
        ...current,
        selected,
        route: galaxyDispatchMatrix[selected] ?? current.route,
      };
    });
  }, []);

  const previous = useCallback(() => {
    setState((current) => {
      const selected = current.selected === 0 ? galaxyDispatchMatrix.length - 1 : current.selected - 1;
      return {
        ...current,
        selected,
        route: galaxyDispatchMatrix[selected] ?? current.route,
      };
    });
  }, []);

  const routeCount = useMemo(() => resolveDispatchMatrix.length, []);

  const branchSummary = useMemo<BranchSummary>(() => {
    const branches = buildFlowBranches(state.route, state.selected);
    const contexts = branchFromContext(branches, state.route);
    const severity = inferSeverity(state.route);
    return {
      severity,
      branches,
      contexts,
      count: branches.length,
    };
  }, [state.route, state.selected]);

  useEffect(() => {
    const localStack = stack.current;
    const disposer = new Map<string, { dispose(): void }>();

    (async () => {
      localStack.defer(() => {
        disposer.clear();
      });

      const phaseMap = new Map<string, string>();
      const selectedBranch = flowBranches[state.selected % flowBranches.length];
      const phaseResult = evaluateFlow(selectedBranch, {
        mode: 'strict',
        runId: `run-${state.selected}` as `run-${string}`,
        depth: state.selected,
      });
      const parsed = parseRouteSignature(state.route as GalaxyRoute);

      const resolved = resolveDispatchMatrix.map((entry) => {
        return {
          branch: selectedBranch,
          timestamp: Date.now(),
          trace: [entry.key, entry.normalized],
        } satisfies BranchEvent;
      });

      const chain = resolveDispatchMatrix[state.selected] as ChainThen<GalaxyRoute> | undefined;
      const chainKey = chain ? chain.key : undefined;
      const chainPhase = chain?.resolved ? ((chain.resolved as { phase?: string }).phase ?? String(chain.key)) : undefined;

      phaseMap.set(parsed.severity, String(chainKey ?? parsed.action));
      const next = evaluateRoutePhase(state.route as GalaxyRoute, branchSummary.count, String(chainKey ?? parsed.action));
      const projected = parseRouteSignature(state.route as GalaxyRoute);

      setState((current) => ({
        ...current,
        map: phaseMap,
        resolved: [parsed],
        branch: resolved,
        timeline: [...current.timeline, next, String(phaseResult.branch), projected.severity, chainPhase ?? parsed.action],
      }));
    })();

    return () => {
      void localStack.disposeAsync().catch(() => undefined);
      for (const value of disposer.values()) {
        value.dispose();
      }
    };
  }, [state.route, state.selected, branchSummary.count]);

  const routeDiscriminator = useMemo(() => {
    const parsed = parseRouteSignature(state.route as GalaxyRoute);
    const chain = resolveDispatchMatrix[state.selected] as ChainThen<GalaxyRoute> | undefined;
    const chainPhase = chain?.resolved ? ((chain.resolved as { phase?: string }).phase ?? String(chain.key)) : undefined;
    const phase = chainPhase ?? parsed.action;
    return {
      opcode: parsed.action,
      phase,
      tenant: parsed.entity,
      severity: parsed.severity,
      routeIndex: state.selected,
      routeCount,
    };
  }, [state.route, state.selected, routeCount]);

  const graph = useMemo(() => {
    const entries = resolveDispatchMatrix
      .flatMap((entry, index) => [
        { key: `${entry.key}-${index}`, value: entry.normalized },
        { key: `${state.route}-${index}`, value: index.toString() },
      ])
      .slice(0, 40);

    return entries.map(({ key, value }) => ({
      key,
      value,
      projected: key.startsWith(`${state.route}`) ? key : `${value}-${state.selected}`,
    }));
  }, [state.route, state.selected]);

  return {
    state,
    route: state.route as GalaxyRoute,
    selected: state.selected,
    routeCount,
    routeDiscriminator,
    branchSummary,
    dispatchMap: state.map,
    graph,
    reset,
    next,
    previous,
  };
};

const evaluateRoutePhase = (route: GalaxyRoute, branchCount: number, branch: string): string => {
  const [, action, severity, id] = route.split('/');
  const hasBranch = branchCount > 4;
  const prefix = hasBranch ? 'dense' : 'sparse';

  return `${prefix}:${action}-${severity}-${id}-${branch}`;
};
