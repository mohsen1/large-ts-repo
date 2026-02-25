import { createContractRuntime, type ContractDescriptor, type ContractRunContext, type ContractRunEvent } from './contract-runtime';
import { mapEvents, toEventStream, withScope, type ScopeSnapshot } from './disposable-scopes';

export type PortName = `port:${string}`;
export type PortPhase = 'ingress' | 'transform' | 'egress' | 'audit';
export type PortProtocol = 'rest' | 'stream' | 'grpc';

export type PortRoute<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? Tail['length'] extends 0
    ? `${Head}`
    : `${Head}::${PortRoute<Tail>}`
  : never;

export type PortMetadata = {
  readonly owner: string;
  readonly team: string;
  readonly level: 'low' | 'medium' | 'high';
  readonly createdAt: string;
};

export interface RuntimePort<TInput extends object, TOutput extends object, TMeta extends PortMetadata = PortMetadata> {
  readonly name: PortName;
  readonly phase: PortPhase;
  readonly protocol: PortProtocol;
  readonly descriptor: {
    readonly id: string;
    readonly route: readonly string[];
  };
  readonly metadata: TMeta;
  readonly transform: (input: TInput, context: {
    readonly phase: PortPhase;
    readonly route: readonly string[];
    readonly protocol: PortProtocol;
  }) => Promise<TOutput> | TOutput;
}

export interface PortAuditEvent {
  readonly id: string;
  readonly level: 'ok' | 'warn' | 'error';
  readonly code: string;
  readonly detail: string;
  readonly at: string;
}

export interface PortNetwork {
  readonly transport: PortProtocol;
  readonly routes: readonly PortName[];
  readonly activeAt: string;
}

export type MergePortInput<
  TLeft extends readonly PortName[],
  TRight extends readonly PortName[],
> = readonly [...TLeft, ...TRight];

export interface RuntimePortSeed<TInput extends object> {
  readonly payload: TInput;
  readonly metadata: {
    readonly owner: string;
    readonly team: string;
    readonly level: 'low' | 'medium' | 'high';
    readonly createdAt: string;
  };
  readonly route: readonly string[];
}

type RuntimePortContractMetadata = {
  readonly tier: 'low' | 'medium' | 'high' | 'critical';
  readonly owner: string;
};

type PortContract = ReturnType<typeof createContractRuntime>;

type RuntimePortContractMap = ReadonlyMap<PortName, `contract:${string}`>;

const nowIso = (): string => new Date().toISOString();
const routeOf = <T extends readonly string[]>(route: T): PortRoute<T> => route.join('::') as PortRoute<T>;
const asPortName = (value: string): PortName => (String(value).startsWith('port:') ? (value as PortName) : `port:${value}` as PortName);
const asContractName = (value: PortName): string => `contract:${String(value).replace(/^port:/, '')}`;
const normalizeLevel = (value: PortMetadata['level']): RuntimePortContractMetadata['tier'] =>
  value === 'high' ? 'critical' : value === 'medium' ? 'medium' : 'low';

const toPortContract = <
  TInput extends object,
  TOutput extends object,
  TMetadata extends PortMetadata,
>(port: RuntimePort<TInput, TOutput, TMetadata>) => {
  return {
    name: asContractName(port.name) as `contract:${string}`,
    slot: `${port.phase}-slot`,
    stage: port.phase === 'ingress'
      ? 'discover'
      : port.phase === 'transform'
        ? 'shape'
        : port.phase === 'egress'
          ? 'execute'
          : 'report',
    dependsOn: [] as const,
    weight: 1,
    run: async (
      event: ContractRunEvent<RuntimePortSeed<object>, RuntimePortContractMetadata>,
      _context: ContractRunContext<RuntimePortContractMetadata>,
    ) => {
      const payload = event.input.payload as TInput;
      const output = await Promise.resolve(
        port.transform(payload, {
          phase: port.phase,
          route: event.input.route,
          protocol: port.protocol,
        }),
      );
      return {
        ok: true,
        output,
        diagnostics: [
          `port:${port.name}`,
          `phase:${port.phase}`,
          `protocol:${port.protocol}`,
          `route:${routeOf(port.descriptor.route)}`,
        ],
        level: normalizeLevel(port.metadata.level),
      } satisfies { ok: true; output: TOutput; diagnostics: readonly string[]; level: 'low' | 'medium' | 'high' | 'critical' };
    },
    metadata: {
      tier: normalizeLevel(port.metadata.level),
      owner: port.metadata.owner,
    } satisfies RuntimePortContractMetadata,
  };
};

const buildPortRuntimeName = (
  network: Omit<PortNetwork, 'activeAt'>,
  ports: readonly RuntimePort<object, object>[],
): string => `runtime:${network.transport}:${ports.length}`;

export interface RuntimePortRegistry<TPorts extends readonly RuntimePort<object, object>[]> {
  readonly ports: TPorts;
  readonly network: PortNetwork;
  readonly runtime: PortContract;
  readonly routeMap: ReadonlyMap<PortName, PortRoute<readonly string[]>>;
  readonly contractByPort: RuntimePortContractMap;
}

const createPortRuntimeMap = <TPorts extends readonly RuntimePort<object, object>[]>
  (ports: TPorts): RuntimePortContractMap => {
  const pairs = ports.map((port) => [
    port.name,
    asContractName(port.name),
  ] as const);

  return new Map(pairs) as RuntimePortContractMap;
};

export const createPortRuntime = <
  TPorts extends readonly RuntimePort<object, object, PortMetadata>[],
>(
  network: Omit<PortNetwork, 'activeAt'>,
  ports: TPorts,
): RuntimePortRegistry<TPorts> => {
  const contractDescriptors = ports.map((port) => toPortContract(port)) as readonly ContractDescriptor<
    RuntimePortSeed<object>,
    object,
    object,
    RuntimePortContractMetadata
  >[];

  const runtime = createContractRuntime(contractDescriptors as unknown as readonly ContractDescriptor<object, unknown, object, object>[]) as PortContract;
  const routeMap = new Map<PortName, PortRoute<readonly string[]>>(ports.map((port) => [port.name, routeOf(port.descriptor.route)]));

  return {
    ports,
    network: {
      ...network,
      activeAt: nowIso(),
    },
    runtime,
    routeMap,
    contractByPort: createPortRuntimeMap(ports),
  } satisfies RuntimePortRegistry<TPorts>;
};

export const inspectPorts = <
  TPorts extends readonly RuntimePort<object, object, PortMetadata>[],
>(registry: RuntimePortRegistry<TPorts>): PortName[] => {
  const discovered = [...registry.network.routes, ...registry.ports.map((entry) => entry.name)];
  return discovered.toSorted();
};

export const executePortNetwork = async <
  TInput extends object,
  TOutput extends object,
>(
  network: Omit<PortNetwork, 'activeAt'>,
  ports: readonly RuntimePort<object, object, PortMetadata>[],
  seed: TInput,
  options?: {
    readonly traceLabel?: string;
    readonly emitWarnings?: boolean;
  },
): Promise<{
  readonly snapshots: readonly ScopeSnapshot[];
  readonly audit: readonly PortAuditEvent[];
  readonly runtimeMap: ReadonlyMap<PortName, TOutput>;
}> => {
  const seedRoute = ['runtime', String(seed).slice(0, 16)] satisfies readonly string[];
  const routeLabel = `${network.transport}::${seedRoute.join('::')}`;
  const registry = createPortRuntime(network, ports as unknown as readonly RuntimePort<object, object, PortMetadata>[]);

  const transport = network.transport;
  const eventSource = toEventStream<TInput>([
    transport,
    ...ports.map((port) => port.name),
    ...(options?.traceLabel ? [options.traceLabel] : []),
  ], [seed]);

  const audit = await mapEvents(
    [transport, ...ports.map((port) => port.name)],
    eventSource,
    (payload, code): PortAuditEvent => ({
      id: `audit:${transport}:${routeLabel}`,
      level: options?.emitWarnings && code.startsWith('warning') ? 'warn' : 'ok',
      code: `audit:${code.split(':')[0]}`,
      detail: `runtime:${routeOf(ports.map((port) => port.name))}`,
      at: nowIso(),
    }),
  ) as unknown as readonly PortAuditEvent[];

  const contractResult = await registry.runtime.runAll({
    seed,
    metadata: {
      owner: 'runtime-service',
      tier: 'medium',
      createdAt: nowIso(),
    },
    stage: 'execute',
    routeLabel,
  }) as ReadonlyMap<string, unknown>;

  const portMap = new Map<PortName, TOutput>();
  const snapshots = await withScope(buildPortRuntimeName(network, ports), async (scope) => {
    scope.emit('trace', `execute:${transport}`);

    for (const [portName, contractName] of createPortRuntimeMap(ports).entries()) {
      const value = contractResult.get(contractName);
      if (value !== undefined) {
        portMap.set(portName, value as TOutput);
      }
    }

    const groupedByPhase = new Map(ports.map((port) => [port.phase, [port.name]]) as [string, PortName[]][]);
    for (const [phase, list] of groupedByPhase.entries()) {
      scope.emit('trace', `${phase}:${list.join('|')}`);
    }

    return [scope.snapshot()];
  });

  return {
    snapshots,
    audit: audit.toSorted((left, right) => left.level.localeCompare(right.level)),
    runtimeMap: portMap,
  };
};

export const mergePortNames = <
  TLeft extends readonly PortName[],
  TRight extends readonly PortName[],
>(left: TLeft, right: TRight): MergePortInput<TLeft, TRight> => [...left, ...right] as MergePortInput<TLeft, TRight>;

export const withRuntimeEnvelope = <
  TInput extends object,
  TOutput extends object,
>(
  port: RuntimePort<TInput, TOutput, PortMetadata>,
  label: string,
): RuntimePort<TInput, TOutput, PortMetadata> => ({
  ...port,
  descriptor: {
    ...port.descriptor,
    id: `${port.descriptor.id}:${label}`,
  },
});
