import { createFactorySeed, executeFactoryGraph, runStressLabFactory, type StressLabFactoryInput } from './stress-lab-type-factory';
import { materializeHubCatalog } from '@domain/recovery-stress-lab';
import { runWorkspace, type WorkspaceInput } from '@shared/stress-lab-runtime';
import { type RouteTupleLike } from '@shared/type-level/stress-recursive-constraint-lattice';

export type OrchestratorCommand = {
  readonly id: string;
  readonly route: RouteTupleLike;
  readonly createdAt: number;
};

type SeedCommand<T extends string> = {
  readonly tag: `stress:${T}`;
  readonly route: RouteTupleLike;
  readonly resolved: {
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
  };
};

type OrchestrationResult<T> = {
  readonly ok: boolean;
  readonly command: OrchestratorCommand;
  readonly output: T;
};

type HubRunner = <TInput, TOutput>(input: TInput, ...handlers: Array<(input: TInput) => TOutput>) => readonly TOutput[];

const makeHubRunner = (): HubRunner => {
  return <TInput, TOutput>(input: TInput, ...handlers: Array<(input: TInput) => TOutput>): readonly TOutput[] =>
    handlers.map((handler) => handler(input));
};

const normalizeCommand = (command: string, fallback: string): OrchestratorCommand => ({
  id: `${command}:${fallback}`,
  route: 'atlas/bootstrap/seed' as RouteTupleLike,
  createdAt: Date.now(),
});

const parseRoute = (route: RouteTupleLike): SeedCommand<string>['resolved'] =>
  ({
    raw: route,
    domain: 'atlas',
    action: 'bootstrap',
    scope: 'seed',
    domainProfile: { scope: 'catalog', tier: 1, criticality: 'low' },
    actionProfile: { stage: 'begin', weight: 1 },
  }) as SeedCommand<string>['resolved'];

const withWorkspace = async (tenant: string, namespace: string, input: WorkspaceInput<Record<string, unknown>>): Promise<string> => {
  const output = await runWorkspace(tenant, [] as const, input);
  return output.ok ? 'ok' : 'fail';
};

const runFactories = async (tenantId: string): Promise<SeedCommand<string>[]> => {
  const { registry } = await materializeHubCatalog(tenantId);
  const commands = registry.blueprints.map((blueprint, index) => {
    const routes = blueprint.routes as readonly RouteTupleLike[];
    const route = routes[index % routes.length] ?? 'atlas/bootstrap/seed';
    return {
      tag: `stress:command-${index}` as `stress:${string}`,
      route,
      resolved: parseRoute(route),
    };
  });
  return commands;
};

export const executeStressLabOrchestration = async <T extends WorkspaceInput>(request: StressLabFactoryInput, context: T): Promise<OrchestratorCommand[]> => {
  const seed = createFactorySeed(request.tenantId);
  await materializeHubCatalog(request.tenantId);
  const factoryState = await runStressLabFactory(request, context as WorkspaceInput<Record<string, unknown>>, request.namespace as unknown as any);
  const runState = {
    seed: factoryState.tenantId,
    namespace: factoryState.namespace,
  };
  const runner = makeHubRunner();
  await withWorkspace(request.tenantId, request.namespace, {
    tenantId: request.tenantId,
    namespace: runState.namespace,
    channel: 'console',
    mode: 'interactive',
    labels: ['stress', seed.label],
    context: context as Record<string, unknown>,
  } as WorkspaceInput<Record<string, unknown>>);

  const commands = await runFactories(request.tenantId);
  const emitted = runner(commands[0], ...commands.slice(1).map((command) => () => command)).flatMap((command) =>
    command.route ? [normalizeCommand(command.route, request.namespace)] : [],
  );
  const matrix = await executeFactoryGraph(factoryState as unknown as never, factoryState.routes);
  return [
    ...emitted,
    {
      id: `${request.tenantId}:${matrix.resolved.scope}`,
      route: matrix.resolved.raw,
      createdAt: Date.now(),
    },
  ];
};

export const orchestrateStressRuns = async <T extends WorkspaceInput>(
  requests: readonly StressLabFactoryInput[],
  context: T,
): Promise<OrchestratorCommand[]> => {
  const outcomes: OrchestratorCommand[] = [];
  for (const request of requests) {
    const output = await executeStressLabOrchestration(request, context);
    for (const command of output) {
      outcomes.push({
        ...command,
        id: `${command.id}-${outcomes.length}`,
      });
    }
  }
  return outcomes;
};

export const dispatchOrchestrationRun = async <TReturn>(
  request: StressLabFactoryInput,
  context: WorkspaceInput,
  handlers: Array<(result: OrchestratorCommand) => TReturn>,
): Promise<OrchestratorCommand[] & { ok: boolean; outputs: ReadonlyArray<TReturn | undefined> }> => {
  const results = await executeStressLabOrchestration(request, context);
  const outputs = results.map((result) => handlers.map((handler) => handler(result))[0]);
  return Object.assign(results, {
    ok: true,
    outputs,
  }) as OrchestratorCommand[] & { ok: boolean; outputs: ReadonlyArray<TReturn | undefined> };
};
