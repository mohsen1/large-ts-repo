import {
  branchEvents,
  branchStates,
  runBranchFlow,
  routeBranches,
  type BranchSeed,
  type BranchSequence,
} from '@shared/type-level/stress-large-controlflow-branches';
import {
  pluginCatalog,
  createDomainRegistry,
  makePluginRecord,
  createPluginRegistry,
  pluginEnvelope,
  type PluginId,
  type PluginConfig,
  type RegistryRecord,
  type PluginRegistryEntry,
  makePluginEntry,
} from '@shared/type-level/stress-hydra-plugin-orchestrator';
import { stageCatalog, runStageChain, stageSignature, stageResultCatalog, stageMatrix } from '@shared/type-level/stress-overload-generic-factory';
import {
  ControlCatalogEntries,
  type ControlResolutionGraph,
  controlCatalogEntries,
  controlGraph,
  controlRouteCatalog,
} from '@shared/type-level/stress-template-control-plane';

export type WindchamberMode = 'drill' | 'forecast' | 'govern' | 'audit';

export type WindchamberBundle = {
  readonly mode: WindchamberMode;
  readonly seed: BranchSeed;
  readonly branchPlan: {
    readonly stateCount: number;
    readonly checksum: string;
  };
  readonly controlRoutes: ControlResolutionGraph<readonly ControlCatalogEntries[]>;
  readonly remap: Record<string, { readonly route: ControlCatalogEntries; readonly index: number; readonly active: boolean }>;
  readonly matrix: ReturnType<typeof runBranchFlow>;
};

export type WindchamberReport = {
  readonly pluginCount: number;
  readonly stageCount: number;
  readonly controlCount: number;
  readonly branchDensity: number;
  readonly catalogKeys: readonly string[];
  readonly stageSignatures: readonly string[];
  readonly routeKeys: readonly string[];
};

export const windchamberCatalog = {
  discover: ['/incident/discover/critical/tenant-alpha', '/fabric/discover/high/tenant-beta'] as const,
  assess: ['/incident/assess/high/tenant-gamma', '/runtime/assess/warning/tenant-delta'] as const,
  notify: ['/policy/notify/low/tenant-eps', '/telemetry/notify/info/tenant-zeta'] as const,
  rollback: ['/orchestrator/rollback/critical/tenant-eta', '/mesh/rollback/high/tenant-theta'] as const,
  simulate: ['/artifact/simulate/medium/tenant-iota', '/runtime/simulate/low/tenant-kappa'] as const,
} satisfies Readonly<Record<string, readonly ControlCatalogEntries[]>>;

const toBranchPlan = (input: BranchSequence): WindchamberBundle['branchPlan'] => {
  const plan = routeBranches(input);
  return {
    stateCount: plan.completed,
    checksum: plan.checksum,
  };
};

const defaultSeed = {
  id: 'branch-default',
  tenant: 'tenant-wind',
  state: 'init',
  severity: 'high',
} satisfies BranchSeed;

export const windchamberRemapped = controlCatalogEntries
  .slice(0, 16)
  .reduce((acc, route, index) => {
    const key = `in:${route}` as keyof Record<string, unknown>;
    acc[key] = {
      route,
      index,
      active: true,
    };
    return acc;
  }, {} as Record<string, { readonly route: ControlCatalogEntries; readonly index: number; readonly active: boolean }>);

export const windchamberBranches = runBranchFlow(defaultSeed, branchStates);
export const windchamberControls = controlGraph as ControlResolutionGraph<readonly ControlCatalogEntries[]>;

export const windchamberBundle = (mode: WindchamberMode): WindchamberBundle => ({
  mode,
  seed: defaultSeed,
  branchPlan: toBranchPlan(branchStates),
  controlRoutes: windchamberControls,
  remap: windchamberRemapped,
  matrix: windchamberBranches,
});

type StageMatrixInput = ReturnType<typeof runBranchFlow>['traces'];

class WindchamberLease implements Disposable {
  private closed = false;
  constructor(private readonly name: string) {}
  [Symbol.dispose](): void {
    this.closed = true;
  }
}

class WindchamberAsyncLease implements AsyncDisposable {
  async [Symbol.asyncDispose](): Promise<void> {}
}

type WindchamberSolverInput = {
  readonly input: string;
  readonly route: string;
};
type WindchamberSolverOutput = {
  readonly route: string;
  readonly token: 'plugin-windchamber';
  readonly state: 'ready';
  readonly weight: 3;
};

const pluginSeed = makePluginRecord(
  'plugin-windchamber-solver' as PluginId,
  {
    input: {
      input: 'seed',
      route: '/incident/discover/critical/tenant-alpha',
    },
    output: {
      route: '/incident/discover/critical/tenant-alpha',
      token: 'plugin-windchamber',
      state: 'ready',
      weight: 3,
    } as const satisfies WindchamberSolverOutput,
    version: '1.0.0',
  },
  {
    kind: 'resolve',
    constraints: {},
    direction: 'center',
    timeoutMs: 300,
  },
);

const windchamberInspector = makePluginRecord(
  'plugin-windchamber-inspector',
  {
    input: { phase: 'inspect' },
    output: { ok: true },
    version: '1.1.0',
  },
  {
    kind: 'inspect',
    constraints: { stage: 1 },
    direction: 'center',
    timeoutMs: 200,
  },
);

export const windchamberRegistry = createPluginRegistry(pluginSeed, windchamberInspector);

const windchamberSolverRecord: RegistryRecord<PluginId, unknown, unknown, Record<string, unknown>, string> = {
  key: 'plugin-windchamber-solver' as PluginId,
  create: (_input: unknown, _config: PluginConfig<Record<string, unknown>, string>): PluginRegistryEntry<
    PluginId,
    WindchamberSolverInput,
    WindchamberSolverOutput,
    Record<string, unknown>,
    string
  > => pluginSeed,
  run: (input: unknown): { readonly route: string; readonly token: 'plugin-windchamber'; readonly state: 'ready'; readonly weight: number } => {
    const context = input as WindchamberSolverInput;
    return {
      route: context.route,
      token: 'plugin-windchamber',
      state: 'ready',
      weight: 3,
    };
  },
};

export const windchamberPluginMatrix = pluginEnvelope('incident', { domain: 'incident', route: '/incident/discover/critical/tenant-alpha' }, [
  windchamberSolverRecord,
]);

const stageMatrixMap = stageMatrix([...stageCatalog], stageSignature);

export const runWindchamber = (traces: StageMatrixInput = [...windchamberBranches.traces]): WindchamberReport => {
  const report: WindchamberReport = {
    pluginCount: windchamberRegistry.size + windchamberPluginMatrix.runCount,
    stageCount: stageCatalog.length,
    controlCount:
      controlRouteCatalog.discover.length +
      controlRouteCatalog.assess.length +
      controlRouteCatalog.rollback.length +
      controlRouteCatalog.notify.length,
    branchDensity: traces.length / Math.max(1, branchEvents.length),
    catalogKeys: Object.keys(windchamberRemapped),
    stageSignatures: stageCatalog.map(stageSignature),
    routeKeys: [...stageMatrixMap.keys()],
  };

  using _lease = new WindchamberLease('runWindchamber');
  const _asyncLease = new WindchamberAsyncLease();

  for (const route of controlRouteCatalog.discover.slice(0, 2)) {
    const catalog = createDomainRegistry('incident');
    for (const entry of catalog) {
      pluginCatalog.set(
        entry.key,
        makePluginRecord(
          entry.key,
          {
            input: {
              domain: route,
            },
            output: {
              ok: true,
              route,
            },
            version: '1.0.0',
          },
          {
            kind: 'inspect',
            constraints: {},
            direction: 'center',
            timeoutMs: 250,
          },
        ),
      );
    }
  }

  void _asyncLease[Symbol.asyncDispose]();

  return {
    ...report,
    pluginCount: report.pluginCount + Object.keys(windchamberRemapped).length + stageResultCatalog.size,
    stageCount: stageResultCatalog.size,
  };
};

export const windchamberStageFlow = runStageChain([...stageCatalog]);
export const windchamberRouteMap: ReturnType<typeof createDomainRegistry> = createDomainRegistry('incident');
export const windchamberSolver = {
  branch: windchamberBranches,
  controls: windchamberControls,
  registry: windchamberRegistry,
  stages: windchamberStageFlow,
  report: runWindchamber(),
} as const;
