import { type NoInfer } from '@shared/type-level';
import { type TenantId, type StageSignal, type RecoverySimulationResult, type StressPhase } from './models';

export type StepId<T extends string> = `step:${T}`;
export type StagePath<T extends string> = T extends `${infer Left}/${infer Rest}` ? readonly [Left, ...StagePath<Rest>] : readonly [T];
export type StageDepth<T extends string> = StagePath<T>['length'];
export type PathLabel<TPrefix extends string, TNode extends string> = `${TPrefix}/${TNode}`;

export type StepLabel<TStep extends string> = `workflow:${TStep}`;

export type StageStepId<TName extends string> = StepId<TName>;
export type StagePathMap<TBlueprint extends readonly StageHandler[]> = {
  readonly [K in TBlueprint[number] as K['name']]: K['path'];
};

type AnyStepHandler = {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly phase: StressPhase;
  readonly run: (input: unknown) => Promise<unknown> | unknown;
};

export interface StageHandler<TPath extends string = string, TName extends string = string, TInput = unknown, TOutput = unknown> {
  readonly id: StageStepId<TName>;
  readonly path: TPath;
  readonly name: TName;
  readonly phase: StressPhase;
  readonly run: (input: TInput) => Promise<TOutput> | TOutput;
}

export interface StageReport {
  readonly stepId: string;
  readonly path: string;
  readonly phase: StressPhase;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outputHint: string;
}

export type StageReportLog<TPath extends string, THistory extends readonly StageReport[]> = {
  readonly history: {
    readonly [K in THistory[number]['stepId']]: Extract<THistory[number], { stepId: K }>
  };
  readonly path: TPath;
};

export type WorkflowInput<TBlueprint extends readonly unknown[]> =
  TBlueprint extends readonly [infer First, ...infer _Tail]
    ? First extends StageHandler<any, any, infer TInput, any>
      ? TInput
      : never
    : never;

export type WorkflowOutput<TBlueprint extends readonly unknown[]> =
  TBlueprint extends readonly [...infer _Head, infer Tail]
    ? Tail extends StageHandler<any, any, any, infer TOutput>
      ? TOutput
      : never
    : never;

type TailStep<TBlueprint extends readonly unknown[]> = TBlueprint extends readonly [...infer _Head, infer Last] ? Last : never;

export interface WorkflowTelemetry<TBlueprint extends readonly unknown[]> {
  readonly tenantId: TenantId;
  readonly steps: readonly string[];
  readonly inputs: PipelineInput<TBlueprint>;
  readonly outputHint: PipelineOutput<TBlueprint>;
}

export type WorkflowTuple<TPrefix extends string, TSteps extends readonly unknown[]> = {
  readonly prefix: TPrefix;
  readonly steps: readonly unknown[];
};

type AppendStep<TPrefix extends readonly unknown[], TNext> = readonly [...TPrefix, TNext];
type PipelineInput<TBlueprint extends readonly unknown[]> = TBlueprint extends readonly [infer First, ...infer _Tail]
  ? First extends StageHandler<any, any, infer TInput, any>
    ? TInput
    : never
  : never;
type PipelineOutput<TBlueprint extends readonly unknown[]> = TBlueprint extends readonly [...infer _Head, infer Tail]
  ? Tail extends StageHandler<any, any, any, infer TOutput>
    ? TOutput
    : never
  : never;

export class WorkflowBuilder<TSteps extends readonly unknown[] = []> {
  readonly #steps: readonly AnyStepHandler[];

  public constructor(steps: TSteps | readonly AnyStepHandler[] = []) {
    this.#steps = [...steps] as readonly AnyStepHandler[];
  }

  public extend<const TName extends string, TInput, TOutput>(
    options: { readonly name: TName; readonly phase: StressPhase; readonly runner: (input: NoInfer<TInput>) => Promise<TOutput> | TOutput },
  ): WorkflowBuilder<AppendStep<TSteps, StageHandler<`root/${TName}`, TName, TInput, TOutput>>> {
    const path = `root/${options.name}` as PathLabel<'root', TName>;
    const step: StageHandler<`root/${TName}`, TName, TInput, TOutput> = {
      id: `step:${options.name}` as StepId<TName>,
      path,
      name: options.name,
      phase: options.phase,
      run: options.runner,
    };

    const next = new WorkflowBuilder<AppendStep<TSteps, StageHandler<`root/${TName}`, TName, TInput, TOutput>>>([
      ...this.#steps,
      step as AnyStepHandler,
    ]);

    return next;
  }

  public async execute(input: PipelineInput<TSteps>): Promise<RecoverySimulationResult | PipelineOutput<TSteps>> {
    const executed = this.#steps.reduce<unknown>((current, step) => {
      const runner = step.run as (value: unknown) => Promise<unknown> | unknown;
      return Promise.resolve(current).then((value) => Promise.resolve(runner(value)));
    }, input as unknown);

    await executed;
    const timestamp = new Date().toISOString();
    const result: RecoverySimulationResult = {
      tenantId: 'tenant-a' as TenantId,
      startedAt: timestamp,
      endedAt: timestamp,
      selectedRunbooks: [],
      ticks: [],
      riskScore: 0,
      slaCompliance: 1,
      notes: this.#steps.map((step) => `${step.name}:${step.path}`),
    };

    return result;
  }

  public telemetry(tenantId: TenantId): WorkflowTelemetry<TSteps> {
    return {
      tenantId,
      steps: this.#steps.map((step) => `workflow:${step.name}`),
      inputs: this.#steps[0]?.run as unknown as PipelineInput<TSteps>,
      outputHint: this.#steps.at(-1)?.run as unknown as PipelineOutput<TSteps>,
    };
  }

  public history(): StageReportLog<'root', readonly StageReport[]> {
    const reports = this.#steps.map((step, index) => ({ ...step, index }));
    const [firstPath] = reports;
    const history = this.#steps.map((step, index) => {
      const at = new Date(Date.now() + index).toISOString();
      return {
        stepId: step.id,
        path: step.path,
        phase: step.phase,
        startedAt: at,
        completedAt: new Date(Date.now() + index + 1).toISOString(),
        outputHint: `${step.name}:ok`,
      } satisfies StageReport;
    });

    return {
      path: (firstPath?.path?.startsWith('root') ? 'root' : 'root') as 'root',
      history: history.reduce<Record<string, StageReport>>((acc, report) => {
        acc[report.stepId] = report;
        return acc;
      }, {}) as StageReportLog<'root', readonly StageReport[]>['history'],
    };
  }
}

export const createBlankWorkflow = <TInputs extends readonly unknown[] = []>(): WorkflowBuilder<TInputs> =>
  new WorkflowBuilder<TInputs>([]);

export const attachTenantTag = (tenantId: TenantId, value: string): `${TenantId}:${string}` => `${tenantId}:${value}`;

export const buildWorkflowTuple = <TPrefix extends string, TSteps extends readonly unknown[]>(
  prefix: TPrefix,
  steps: TSteps,
): WorkflowTuple<TPrefix, TSteps> => ({
  prefix,
  steps: steps as readonly unknown[],
} as unknown as WorkflowTuple<TPrefix, TSteps>);

export const previewWorkflow = <TSignals extends readonly StageSignal[]>(signals: TSignals): readonly StageSignal[] => [...signals];
