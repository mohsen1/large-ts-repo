import { useEffect, useMemo, useState } from 'react';

import {
  instantiateCarrier,
  chainCarrierEmit,
  type DepthCarrier40,
} from '@shared/type-level/stress-deep-subtype-escalation';
import {
  resolveDispatchRoute,
  dispatchCatalog,
  buildDispatchChains,
  type DispatchUnion,
} from '@shared/type-level/stress-conditional-dispatch-grid';
import {
  routeTemplates,
  resolveRouteDispatch,
  type RouteTemplate,
} from '@shared/type-level/stress-template-route-matrix';
import { makeDisjointProfile, type ComposeDisjoint } from '@shared/type-level/stress-disjoint-intersection-forge';
import { executeFlow, type StageEvent, type StageState, type FlowBranch } from '@shared/type-level/stress-controlflow-switchyard';
import { evaluate, boolTuple, type ChainTemplate } from '@shared/type-level/stress-binary-expression-galaxy';

export type HarnessMode = 'idle' | 'loading' | 'ready' | 'error';

export type StressRoute = RouteTemplate;
type RouteDispatchRow = ReturnType<typeof resolveRouteDispatch>;
type DispatchRouteSnapshot = {
  readonly scope: string;
  readonly parsed: {
    readonly verb: string;
  };
  readonly route?: string;
  readonly label?: string;
  readonly severity?: string;
  readonly resolvedAt?: number;
  readonly dispatchKey?: string;
  readonly policy?: unknown;
  [key: string]: unknown;
};
type DispatchCatalogSnapshot = Record<string, { readonly resolution: DispatchRouteSnapshot }>;
type RouteDispatchMatrix = {
  readonly list: readonly RouteDispatchRow[];
  readonly index: Record<string, RouteDispatchRow>;
};

export interface StressHarnessInput {
  readonly tenantId: string;
  readonly branch: FlowBranch;
  readonly mode: HarnessMode;
  readonly maxBranches?: number;
}

export interface StressHarnessState {
  readonly mode: HarnessMode;
  readonly tenantLabel: string;
  readonly routeCatalog: DispatchCatalogSnapshot;
  readonly matrix: RouteDispatchMatrix;
  readonly dispatchResults: ReadonlyArray<DispatchRouteSnapshot>;
  readonly chains: ReturnType<typeof buildDispatchChains>;
  readonly carrier: DepthCarrier40;
  readonly carrierLabel: string;
  readonly flowStates: StageState[];
  readonly binarySamples: boolean[];
  readonly matrixSignals: ChainTemplate<['orbit', 'dispatch', 'route', 'check']>;
  readonly profile: ComposeDisjoint<{ routeId: string }>;
}

const baseDispatches: readonly DispatchUnion[] = [
  '/incident/create/critical/id-alpha',
  '/incident/notify/medium/id-bravo',
  '/policy/assess/high/id-charlie',
  '/telemetry/query/low/id-echo',
  '/continuity/restore/critical/id-foxtrot',
  '/chronicle/archive/low/id-golf',
  '/mesh/flush/high/id-india',
  '/runtime/reconcile/medium/id-kilo',
  '/workflow/create/high/id-sierra',
  '/catalog/create/diagnostic/id-victor',
] as const;

export const useTypeLevelStressHarness = ({ tenantId, mode, maxBranches = 16 }: StressHarnessInput): StressHarnessState => {
  const [currentMode, setCurrentMode] = useState<HarnessMode>(mode);
  const [routeCatalog, setRouteCatalog] = useState<DispatchCatalogSnapshot>(() => {
    return dispatchCatalog(baseDispatches) as DispatchCatalogSnapshot;
  });

  const carrier = useMemo<DepthCarrier40>(() => {
    return instantiateCarrier(tenantId);
  }, [tenantId]);

  const matrix = useMemo<RouteDispatchMatrix>(() => {
    const matrixInput = routeTemplates.map((entry) => resolveRouteDispatch(entry));
    const index = matrixInput.reduce<RouteDispatchMatrix['index']>((acc, item) => {
      const key = `${item.envelope.domain}::${item.envelope.action}`;
      return {
        ...acc,
        [key]: item,
      };
    }, {} as RouteDispatchMatrix['index']);
    return {
      list: matrixInput as RouteDispatchMatrix['list'],
      index,
    };
  }, []);

  const profile = useMemo(() => {
    return makeDisjointProfile('routeId', 'stress-route');
  }, []);

  const dispatchResults = useMemo<DispatchRouteSnapshot[]>(() => {
    const outputs: DispatchRouteSnapshot[] = [];
    for (const key of baseDispatches) {
      outputs.push(routeCatalog[key]!.resolution);
    }
    return outputs;
  }, [routeCatalog]);

  const chains = useMemo(() => {
    const raw = buildDispatchChains(baseDispatches);
    return raw.slice(0, maxBranches);
  }, [maxBranches]);

  const flowStates = useMemo<StageState[]>(() => {
    const seed = dispatchResults.map((_, index) => {
      if (index % 4 === 0) {
        return {
          kind: 'seed',
          active: true,
          severity: index % 2 === 0 ? 'high' : 'medium',
          tenantId,
          nodeId: `node-${index}`,
          attempt: index,
          seed: `seed-${index}`,
          patterns: [],
          evidence: [],
          actions: [],
          windowMs: 100,
          approvedBy: 'planner',
          dependencies: [],
          target: `target-${index}`,
          timeoutMs: 500,
          metrics: {},
          recipients: [],
          success: true,
        } as StageEvent;
      }

      if (index % 4 === 1) {
        return {
          kind: 'detect',
          active: true,
          severity: 'low',
          tenantId,
          nodeId: `node-${index}`,
          attempt: index,
          patterns: ['signal', 'drift'],
          evidence: [],
          actions: [],
          windowMs: 100,
          approvedBy: 'inspector',
          dependencies: [],
          target: `target-${index}`,
          timeoutMs: 500,
          metrics: {},
          recipients: [],
          success: true,
          routeId: `route-${index}`,
          sourceId: `source-${index}`,
          seed: `seed-${index}`,
        } as StageEvent;
      }

      if (index % 4 === 2) {
        return {
          kind: 'verify',
          active: true,
          severity: 'critical',
          tenantId,
          nodeId: `node-${index}`,
          attempt: index,
          evidence: [1, 2, 3],
          patterns: [],
          actions: [],
          windowMs: 300,
          approvedBy: 'auditor',
          dependencies: [],
          target: `target-${index}`,
          timeoutMs: 500,
          metrics: {},
          recipients: [],
          success: true,
          seed: `seed-${index}`,
          routeId: `route-${index}`,
          sourceId: `source-${index}`,
        } as StageEvent;
      }

      return {
        kind: 'orchestrate',
        active: true,
        severity: 'medium',
        tenantId,
        nodeId: `node-${index}`,
        attempt: index,
        dependencies: [`dep-${index}`],
        target: `target-${index}`,
        timeoutMs: 500,
        metrics: {},
        recipients: [],
        success: false,
        seed: `seed-${index}`,
        routeId: `route-${index}`,
        sourceId: `source-${index}`,
        patterns: [],
        evidence: [],
        actions: ['act'],
        windowMs: 100,
        approvedBy: 'operator',
      } as StageEvent;
    });

    return executeFlow(tenantId, seed);
  }, [tenantId, dispatchResults]);

  const binarySamples = useMemo<boolean[]>(() => {
    const values = boolTuple(20);
    return values.map((value) => {
      const signature = value ? '1&&1' : '1||0';
      return evaluate(signature);
    });
  }, []);

  useEffect(() => {
    setCurrentMode(mode);
    setRouteCatalog(dispatchCatalog(baseDispatches));
  }, [mode]);

  return {
    mode: currentMode,
    tenantLabel: tenantId,
    routeCatalog,
    matrix,
    dispatchResults,
    chains,
    carrier,
    carrierLabel: chainCarrierEmit(carrier),
    flowStates,
    binarySamples,
    matrixSignals: 'orbit-dispatch-route-check',
    profile,
  };
};

export const selectProfile = (state: StressHarnessState): string => `${state.tenantLabel}:${state.carrier.tier}`;
