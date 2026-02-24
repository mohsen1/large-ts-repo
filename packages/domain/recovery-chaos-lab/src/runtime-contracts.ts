import type { StageBoundary } from './types';

export type RuntimeNoInfer<T> = [T][T extends infer U ? 0 : never];

export interface RuntimeFrame<TNamespace extends string, TScenario extends string, TStage extends string> {
  readonly namespace: TNamespace;
  readonly scenarioId: TScenario;
  readonly stage: TStage;
  readonly timestamp: number;
  readonly sequence: number;
}

export type RuntimeFrameMap<
  TNamespace extends string,
  TScenario extends string,
  TStages extends readonly string[]
> = {
  [K in TStages[number] as `frame:${TNamespace}:${TScenario}:${K}`]: RuntimeFrame<TNamespace, TScenario, K>;
};

export interface RuntimeCommand<T extends string = string> {
  readonly command: `chaos:${T}`;
  readonly label: string;
  readonly requestedBy: string;
  readonly reason?: string;
}

export type CommandEnvelope<TCmd extends RuntimeCommand> = {
  readonly command: TCmd['command'];
  readonly requestId: string;
  readonly issuedAt: number;
  readonly metadata: Record<string, string>;
};

export interface RuntimePayload<T extends string, TInput> {
  readonly name: `payload:${T}`;
  readonly input: TInput;
}

export type RuntimeContext = {
  readonly traceId: string;
  readonly requestId: string;
  readonly namespace: string;
};

export interface RuntimeAdapter<
  TName extends string,
  TInput,
  TOutput,
  TContext extends RuntimeContext = RuntimeContext
> {
  readonly name: TName;
  readonly execute: (
    input: RuntimePayload<TName, TInput>,
    context: RuntimeNoInfer<TContext>
  ) => Promise<TOutput>;
}

export type AdapterMap<T extends readonly RuntimeAdapter<string, unknown, unknown>[]> = {
  [K in T[number] as K['name']]: K;
};

export type StageContract<TStages extends readonly StageBoundary<string, unknown, unknown>[]> = {
  readonly name: TStages[number]['name'];
  readonly accepts: TStages[number];
  readonly emits: RuntimeNoInfer<TStages[number]['output']>;
};

export interface RuntimeContract<
  TNamespace extends string,
  TScenario extends string,
  TStages extends readonly StageBoundary<string, unknown, unknown>[]
> {
  readonly namespace: TNamespace;
  readonly scenarioId: TScenario;
  readonly command: RuntimeCommand<'run' | 'verify' | 'rollback' | 'recover'>;
  readonly stages: TStages;
  readonly stageMap: RuntimeFrameMap<TNamespace, TScenario, TStages[number]['name'][]>;
}

export interface RuntimeEvent<TStage extends string = string> {
  readonly eventType: `chaos:${TStage}:event`;
  readonly payload: Record<string, unknown>;
  readonly emittedAt: number;
}

export type RuntimeEnvelope<
  TNamespace extends string,
  TScenario extends string,
  TStages extends readonly StageBoundary<string, unknown, unknown>[],
  TEvent extends string = string
> = {
  readonly namespace: TNamespace;
  readonly scenarioId: TScenario;
  readonly event: RuntimeEvent<TEvent>;
  readonly contract: RuntimeContract<TNamespace, TScenario, TStages>;
};

export function satisfiesRuntimeFrame<T extends RuntimeFrame<string, string, string>>(
  frame: T
): T {
  return frame;
}

export function normalizeFrameNamespace<TNamespace extends string>(
  namespace: TNamespace,
  scenarioId: string
): `${TNamespace}:${string}` {
  return `${namespace}:${scenarioId}`;
}

export function toCommandEnvelope<
  T extends RuntimeCommand
>(command: T, requestId: string): CommandEnvelope<T> {
  return {
    command: command.command,
    requestId,
    issuedAt: Date.now(),
    metadata: {
      command: command.command,
      label: command.label,
      issuedBy: command.requestedBy
    }
  };
}

export function buildRuntimeEnvelope<
  TNamespace extends string,
  TScenario extends string,
  TStages extends readonly StageBoundary<string, unknown, unknown>[],
  TEvent extends string
>(
  namespace: TNamespace,
  scenarioId: TScenario,
  stages: TStages,
  event: RuntimeEvent<TEvent>
): RuntimeEnvelope<TNamespace, TScenario, TStages, TEvent> {
  return {
    namespace,
    scenarioId,
    event,
    contract: {
      namespace,
      scenarioId,
      command: {
        command: 'chaos:run',
        label: 'runtime-boot',
        requestedBy: 'system'
      },
      stages,
      stageMap: Object.fromEntries(
        stages.map((stage) => [`frame:${namespace}:${scenarioId}:${stage.name}`, { namespace, scenarioId, stage: stage.name, timestamp: Date.now(), sequence: 0 }])
      ) as RuntimeEnvelope<TNamespace, TScenario, TStages, TEvent>['contract']['stageMap']
    }
  };
}

export function projectCommandNames<T extends readonly RuntimeCommand<string>[]>(commands: T): readonly T[number]['command'][] {
  return commands.map((command) => command.command) as readonly T[number]['command'][];
}

export function keyByStage<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: TStages
): {
  [K in TStages[number] as `stage:${K['name']}`]: K;
} {
  return Object.fromEntries(stages.map((stage) => [`stage:${stage.name}`, stage] as const)) as {
    [K in TStages[number] as `stage:${K['name']}`]: K;
  };
}
