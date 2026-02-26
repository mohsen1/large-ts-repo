import type { Brand } from '@shared/type-level';
import { evaluateLattice, type LatticeInput, type LatticeOutput } from './class-lattice';

export type FlowPhase = 'init' | 'dispatch' | 'validate' | 'coordinate' | 'execute' | 'sweep' | 'finalize' | 'done' | 'error';
export type FlowDomain = 'ops' | 'fabric' | 'timeline' | 'cadence' | 'quantum' | 'playbook' | 'signal';
export type FlowPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type FlowToken = Brand<string, 'FlowToken'>;
export type FlowCommandId = Brand<string, 'FlowCommandId'>;

export type FlowEvent =
  | {
      readonly kind: 'command';
      readonly phase: FlowPhase;
      readonly commandId: FlowCommandId;
      readonly priority: FlowPriority;
      readonly domain: FlowDomain;
      readonly payload: { readonly tenant: Brand<string, 'Tenant'>; readonly route: string };
    }
  | {
      readonly kind: 'metric';
      readonly phase: FlowPhase;
      readonly commandId: FlowCommandId;
      readonly value: number;
    }
  | {
      readonly kind: 'terminal';
      readonly phase: 'done' | 'error';
      readonly commandId: FlowCommandId;
      readonly message: string;
    };

export type FlowCommand = {
  readonly commandId: FlowCommandId;
  readonly phase: FlowPhase;
  readonly domain: FlowDomain;
  readonly domainIndex: number;
  readonly severity: FlowPriority;
};

export interface FlowExecutionResult {
  readonly commandId: FlowCommandId;
  readonly token: FlowToken;
  readonly phase: FlowPhase;
  readonly nextPhase: FlowPhase | null;
  readonly accepted: boolean;
  readonly trace: ReadonlyArray<string>;
}

export interface FlowGraphPath<TPhase extends FlowPhase> {
  readonly phase: TPhase;
  readonly transitions: ReadonlyArray<FlowPhase>;
}

export type PhaseTransition<T extends FlowPhase> = T extends 'init'
  ? 'dispatch'
  : T extends 'dispatch'
    ? 'validate'
    : T extends 'validate'
      ? 'coordinate'
      : T extends 'coordinate'
        ? 'execute'
        : T extends 'execute'
          ? 'sweep'
          : T extends 'sweep'
            ? 'finalize'
            : T extends 'finalize'
              ? 'done'
              : 'error';

export type FlowBranch<T> = T extends 'ops' ? 'dispatch' | 'validate'
  : T extends 'fabric' ? 'coordinate' | 'execute'
  : T extends 'timeline' ? 'sweep' | 'finalize'
  : T extends 'cadence' ? 'execute' | 'sweep'
  : T extends 'quantum' ? 'validate' | 'finalize'
  : T extends 'playbook' ? 'dispatch' | 'coordinate'
  : T extends 'signal' ? 'sweep' | 'finalize'
  : never;

export type DomainAware<TDomain extends FlowDomain> = {
  readonly domain: TDomain;
  readonly branches: readonly FlowBranch<TDomain>[];
};

const phaseSequence: ReadonlyArray<FlowPhase> = [
  'init',
  'dispatch',
  'validate',
  'coordinate',
  'execute',
  'sweep',
  'finalize',
  'done',
];

const transitionMatrix = {
  init: 'dispatch',
  dispatch: 'validate',
  validate: 'coordinate',
  coordinate: 'execute',
  execute: 'sweep',
  sweep: 'finalize',
  finalize: 'done',
  done: 'done',
  error: 'error',
} as const satisfies Record<FlowPhase, FlowPhase>;

const domainConfig: ReadonlyArray<DomainAware<FlowDomain>> = [
  { domain: 'ops', branches: ['dispatch', 'validate'] },
  { domain: 'fabric', branches: ['coordinate', 'execute'] },
  { domain: 'timeline', branches: ['sweep', 'finalize'] },
  { domain: 'cadence', branches: ['execute', 'sweep'] },
  { domain: 'quantum', branches: ['validate', 'finalize'] },
  { domain: 'playbook', branches: ['dispatch', 'coordinate'] },
  { domain: 'signal', branches: ['sweep', 'finalize'] },
] as const;

const resolveByPhase = (phase: FlowPhase, domain: FlowDomain): FlowPhase => {
  if (phase === 'error' || phase === 'done') {
    return phase;
  }
  if (phase === 'validate' && domain === 'quantum') {
    return 'sweep';
  }
  if (phase === 'coordinate' && domain === 'playbook') {
    return 'execute';
  }
  return transitionMatrix[phase];
};

export const runFlowGraph = (commands: ReadonlyArray<FlowCommand>): ReadonlyArray<FlowExecutionResult> => {
  const output: FlowExecutionResult[] = [];
  for (const command of commands) {
    const token = `token:${command.commandId}:${command.domain}` as FlowToken;
    const next = resolveByPhase(command.phase, command.domain);
    const trace: string[] = [];
    let current = command.phase;
    for (let index = 0; index < phaseSequence.length; index += 1) {
      trace.push(current);
      if (current === 'done' || current === 'error') {
        break;
      }
      current = resolveByPhase(current, command.domain);
    }
    output.push({
      commandId: command.commandId,
      token,
      phase: command.phase,
      nextPhase: next,
      accepted: trace.includes('done') || command.phase !== 'error',
      trace,
    });
  }
  return output;
};

const evaluateCommandMap = (command: Pick<FlowCommand, 'domain'>): DomainAware<FlowDomain> =>
  domainConfig.find((item) => item.domain === command.domain) ?? { domain: command.domain, branches: ['dispatch'] };

export const classifyCommand = (command: FlowCommand): `class:${FlowDomain}:${FlowPriority}` => {
  const config = evaluateCommandMap(command);
  const branch = config.branches[command.domainIndex % config.branches.length] ?? 'dispatch';
  return `class:${config.domain}:${branch === 'dispatch' ? command.severity : 0}` as `class:${FlowDomain}:${FlowPriority}`;
};

export const inspectFlow = (commands: ReadonlyArray<FlowCommand>): ReadonlyArray<FlowExecutionResult> => {
  const staged: FlowEvent[] = commands.flatMap((command) => {
    const trace = runFlowGraph([command]);
    const last = trace.at(-1);
    if (last === undefined) {
      return [];
    }
    return [
      {
        kind: 'command',
        phase: command.phase,
        commandId: command.commandId,
        priority: command.severity,
        domain: command.domain,
        payload: {
          tenant: `tenant-${command.domainIndex}` as Brand<string, 'Tenant'>,
          route: `/${command.domain}/dispatch/${command.commandId}`,
        },
      },
      { kind: 'metric', phase: last.phase, commandId: command.commandId, value: trace.length },
      {
        kind: last.nextPhase === 'error' ? 'terminal' : 'metric',
        phase: last.nextPhase ?? 'done',
        commandId: command.commandId,
        ...(last.nextPhase === 'error' ? { message: `phase=${last.phase}` } : { value: last.trace.length }),
      } as FlowEvent,
    ];
  });
  return staged
    .map((event) => {
      if (event.kind === 'command') {
        const command = {
          commandId: event.commandId,
          phase: event.phase,
          domain: event.domain,
          domainIndex: commandDomainOffset(event.domain),
          severity: event.priority,
        } satisfies FlowCommand;
        return {
          commandId: event.commandId,
          token: `inspect:${event.commandId}` as FlowToken,
          phase: event.phase,
          nextPhase: resolveByPhase(event.phase, event.domain),
          accepted: event.priority < 5,
          trace: [classifyCommand(command), event.kind, event.domain],
        } satisfies FlowExecutionResult;
      }
      if (event.kind === 'terminal') {
        return {
          commandId: event.commandId,
          token: `inspect:${event.commandId}:done` as FlowToken,
          phase: event.phase,
          nextPhase: event.phase,
          accepted: true,
          trace: [event.message],
        } satisfies FlowExecutionResult;
      }
      return {
        commandId: event.commandId,
        token: `inspect:${event.commandId}:metric` as FlowToken,
        phase: event.phase,
        nextPhase: resolveByPhase(event.phase, 'ops'),
        accepted: event.value < 100,
        trace: [String(event.value)],
      } satisfies FlowExecutionResult;
    });
};

const commandDomainOffset = (domain: FlowDomain): number => {
  switch (domain) {
    case 'ops':
      return 10;
    case 'fabric':
      return 20;
    case 'timeline':
      return 30;
    case 'cadence':
      return 40;
    case 'quantum':
      return 50;
    case 'playbook':
      return 60;
    case 'signal':
      return 70;
    default:
      return 80;
  }
};

export const orchestrateFlow = (
  commands: ReadonlyArray<FlowCommand>,
): ReadonlyArray<{ readonly commandId: FlowCommandId; readonly lattice: LatticeOutput } & { readonly score: number }> => {
  const input: LatticeInput[] = commands.map((command) => ({
    tenant: `tenant-${command.domain}` as unknown as Brand<string, 'LatticeTenantInput'>,
    mode: command.phase === 'execute' ? 'execution' : command.phase === 'dispatch' ? 'discovery' : 'validation',
    route: `/${command.domain}/${command.phase}/${command.commandId}` as Brand<string, 'LatticeRoute'>,
    limit: command.domainIndex,
  }));
  const lattice = evaluateLattice(input);
  return commands.map((command, index) => {
    const current = lattice[index % lattice.length]!;
    return {
      commandId: command.commandId,
      lattice: current,
      score: current.score + command.severity,
    };
  });
};

export const executeFlow = (commands: ReadonlyArray<FlowCommand>): number => {
  const results = runFlowGraph(commands);
  const inspection = inspectFlow(commands);
  const orchestration = orchestrateFlow(commands);
  return results.reduce((acc, result) => acc + result.trace.length + (result.accepted ? 1 : 0), 0)
    + inspection.reduce((acc, event) => acc + event.trace.length + (event.accepted ? 1 : 0), 0)
    + orchestration.reduce((acc, entry) => acc + entry.score, 0);
};
