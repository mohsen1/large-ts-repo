import { stressHubComposition } from '@shared/type-level-hub';

type SolverMode = 'strict' | 'relaxed' | 'diagnostic' | 'batch' | 'replay';

type SolverRun = ReturnType<typeof stressHubComposition.runConstraintHub>;
type BranchOutcome = (typeof stressHubComposition.hubBranchOutcomes)[number];
type HubBundle = ReturnType<typeof stressHubComposition.buildHubFlow>;

export type StressHubSession = {
  readonly id: string;
  readonly mode: SolverMode;
  readonly startedAt: string;
  readonly branchOutcomes: readonly BranchOutcome[];
  readonly telemetry: {
    readonly pathLength: number;
    readonly routeCount: number;
    readonly solverWeight: number;
  };
};

type SolverEnvelope = {
  readonly solved: boolean;
  readonly routeId: string;
  readonly checks: number;
  readonly activeCount: number;
};

type SolverPlan = {
  readonly branchCount: number;
  readonly constraintProfile: SolverRun;
  readonly bundle: HubBundle;
  readonly trace: readonly string[];
};

const modeToTemplate = {
  strict: ['window', 'priority', 'checkpoint'],
  relaxed: ['window', 'retry'],
  diagnostic: ['trace', 'latency'],
  batch: ['batchSize', 'drain'],
  replay: ['timestamp', 'delta'],
} as const satisfies Record<SolverMode, readonly string[]>;

const randomSeed = async (value: string): Promise<string> =>
  Promise.resolve(value)
    .then((v) => `${v}-${v.length}`)
    .then((v) => v.slice(0, 32));

const summarizeBundle = (bundle: HubBundle) => ({
  solverNames: Object.keys(bundle.solver).length,
  solvedCount: bundle.solver.solved.length,
  signalDepth: bundle.solver.routeChain.tree.flatLength,
});

export const runCompilerStressHub = async <T extends SolverMode>(mode: T, options?: { readonly tenant: string }) => {
  const runId = await randomSeed(`lab-${mode}-${options?.tenant ?? 'default'}`);
  const seededRoutes = stressHubComposition.hubNexusSeed.slice(0, 6);
  const solverRun = stressHubComposition.runConstraintHub(mode);
  const hubFlow = stressHubComposition.buildHubFlow(runId, 8);
  const telemetry = {
    pathLength: stressHubComposition.hubLayerPath.length,
    routeCount: seededRoutes.length,
    solverWeight: solverRun.traces.length,
  };
  const branchOutcomes = stressHubComposition.hubBranchOutcomes;
  const profile: SolverEnvelope = {
    solved: solverRun.solved,
    routeId: runId,
    checks: telemetry.solverWeight,
    activeCount: telemetry.routeCount + branchOutcomes.length,
  };
  const plan: SolverPlan = {
    branchCount: solverRun.traces.length,
    constraintProfile: solverRun,
    bundle: hubFlow,
    trace: modeToTemplate[mode],
  };
  const { solverNames, solvedCount } = summarizeBundle(hubFlow);
  const session: StressHubSession = {
    id: runId,
    mode,
    startedAt: new Date().toISOString(),
    branchOutcomes,
    telemetry: {
      pathLength: telemetry.pathLength,
      routeCount: telemetry.routeCount,
      solverWeight: telemetry.solverWeight + solvedCount + solverNames,
    },
  };

  return {
    session,
    profile,
    plan,
    diagnostics: {
      solvedCount,
      path: hubFlow.path,
      modeConfig: modeToTemplate[mode],
    },
  };
};

export const runCompilerStressHubLabGrid = async () => {
  const modes: SolverMode[] = ['strict', 'relaxed', 'diagnostic', 'batch', 'replay'];
  const sessions = await Promise.all(modes.map((mode) => runCompilerStressHub(mode, { tenant: 'grid' })));

  const index = sessions.reduce((acc, session, index) => ({
    ...acc,
    [`run_${index}`]: session.session.id,
  }), {} as Record<string, string>);

  return {
    sessions,
    index,
    templateCount: modes.length,
  };
};

export const stressHubSolverCatalog = {
  profile: stressHubComposition.hubNexusProfile,
  classChain: stressHubComposition.hubClassChain,
  events: stressHubComposition.hubEventProfiles,
  templates: stressHubComposition.hubEventTemplates,
  branchProfiles: stressHubComposition.hubBranchProfiles,
} as const;
