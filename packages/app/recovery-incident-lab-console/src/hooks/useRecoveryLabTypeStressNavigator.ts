import {
  type BranchState,
  parseRoute,
  type ControlRoute,
  type BranchSeed,
  type BranchPlan,
  runBranchFlow,
  routeBranches,
  branchStates,
  type ControlCatalogEntries,
  controlCatalogEntries,
} from '@shared/type-level-hub';
import { useCallback, useMemo, useState } from 'react';

export type StressNavigatorMode = 'diagnostic' | 'execution' | 'timeline' | 'review';

export type NavigatorState = {
  readonly mode: StressNavigatorMode;
  readonly selected: number;
  readonly route: ControlRoute;
  readonly routeCount: number;
  readonly matrix: ReturnType<typeof routeBranches>;
  readonly branchState: BranchState;
  readonly routeLog: readonly ControlCatalogEntries[];
  readonly plan: BranchPlan<readonly BranchState[]>;
};

type NavigatorEvent = {
  readonly at: number;
  readonly route: ControlRoute;
  readonly branchState: BranchState;
  readonly mode: StressNavigatorMode;
};

const initialRoute = controlCatalogEntries[0] ?? '/incident/discover/critical/tenant-alpha';
const baseSeed: BranchSeed = {
  id: 'branch-nav',
  tenant: 'tenant-navigator',
  state: 'init',
  severity: 'high',
};

type WorkbenchRouteEnvelope = ReturnType<typeof parseRoute>;

export const useRecoveryLabTypeStressNavigator = () => {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<StressNavigatorMode>('diagnostic');
  const [timeline, setTimeline] = useState<readonly NavigatorEvent[]>([]);

  const route = controlCatalogEntries[selected % controlCatalogEntries.length] ?? initialRoute;

  const matrix = useMemo(() => routeBranches(branchStates), []);
  const branchState = runBranchFlow(baseSeed, matrix.steps).report.state;
  const plan = matrix;

  const routeEnvelopes = useMemo<readonly WorkbenchRouteEnvelope[]>(() => {
    return controlCatalogEntries.slice(0, 12).map((entry) => parseRoute(entry));
  }, []);

  const pushTimeline = useCallback(
    (entry: ControlRoute) => {
      setTimeline((currentTimeline) => [
        ...currentTimeline.slice(-24),
        {
          at: Date.now(),
          route: entry,
          branchState,
          mode,
        },
      ]);
    },
    [branchState, mode],
  );

  const next = useCallback(() => {
    setSelected((current) => {
      const nextIndex = (current + 1) % controlCatalogEntries.length;
      pushTimeline(controlCatalogEntries[nextIndex] ?? initialRoute);
      return nextIndex;
    });
  }, [pushTimeline]);

  const previous = useCallback(() => {
    setSelected((current) => {
      const previousIndex = current === 0 ? controlCatalogEntries.length - 1 : current - 1;
      pushTimeline(controlCatalogEntries[previousIndex] ?? initialRoute);
      return previousIndex;
    });
  }, [pushTimeline]);

  const reset = useCallback(() => {
    setSelected(0);
    setMode('diagnostic');
    setTimeline([]);
  }, []);

  const modeClass = mode === 'diagnostic' ? 'primary' : mode === 'execution' ? 'accent' : mode === 'timeline' ? 'subtle' : 'neutral';

  const rotate = useCallback(() => {
    setMode((current) => {
      if (current === 'diagnostic') {
        return 'execution';
      }
      if (current === 'execution') {
        return 'timeline';
      }
      if (current === 'timeline') {
        return 'review';
      }
      return 'diagnostic';
    });
  }, []);

  const routeCount = controlCatalogEntries.length;

  const diagnostics = {
    modeClass,
    matrixStepCount: matrix.steps.length,
    routeCount,
    logDepth: timeline.length,
    branchState,
    recentRoute: route,
  };

  return {
    state: {
      mode,
      selected,
      route,
      routeCount,
      matrix,
      branchState,
      routeLog: controlCatalogEntries,
      plan,
    } satisfies NavigatorState,
    routeEnvelopes,
    timeline,
    diagnostics,
    branchState,
    currentRouteIndex: selected,
    routeCount,
    next,
    previous,
    reset,
    rotate,
  };
};
