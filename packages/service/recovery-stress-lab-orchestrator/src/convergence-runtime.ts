import {
  bootstrapCatalog,
  createConstraintId,
  createConvergenceRunId,
  createTenantRunInput,
  runConvergenceWorkflow,
  type ConvergenceConstraint,
  type ConvergenceInput,
  type ConvergenceOutput,
  type ConvergenceRunId,
  type ConvergenceScope,
  type ConvergenceStage,
} from '@domain/recovery-lab-orchestration-core';
import {
  ConvergenceStore,
  toConstraintTrace,
  collectConstraintPayload,
} from '@data/recovery-incident-lab-store';
import {
  createRunbookId,
  createSignalId,
  createStepId,
  createTenantId,
  createWorkloadId,
  type CommandRunbook,
  type RecoverySignal,
  type TenantId,
} from '@domain/recovery-stress-lab';
import { runLatticeCompileChain } from '@domain/recovery-lab-orchestration-core';

export interface RuntimeInput<
  TScope extends ConvergenceScope = ConvergenceScope,
  TStage extends ConvergenceStage = ConvergenceStage,
> {
  readonly tenantId: string;
  readonly scope: TScope;
  readonly stage: TStage;
  readonly signals: readonly string[];
  readonly runbooks: readonly string[];
}

export interface RuntimeOutput {
  readonly runId: ConvergenceRunId;
  readonly manifestDigest: string;
  readonly output: ConvergenceOutput;
  readonly constraints: readonly ConvergenceConstraint[];
  readonly timeline: readonly string[];
}

export interface RuntimeManifest {
  readonly tenantId: string;
  readonly stage: ConvergenceStage;
  readonly scope: ConvergenceScope;
  readonly planCount: number;
  readonly pluginCount: number;
}

export interface RuntimeEvents {
  readonly name: string;
  readonly at: string;
  readonly runId: ConvergenceRunId;
}

class ConvergenceRuntimeSession {
  readonly #store = new ConvergenceStore();
  readonly #events: RuntimeEvents[] = [];

  constructor(readonly tenantId: string) {}

  [Symbol.dispose](): void {
    this.#events.length = 0;
    void this.#store.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#store.close();
  }

  get events(): readonly RuntimeEvents[] {
    return [...this.#events];
  }

  private record(name: string, runId: ConvergenceRunId): void {
    this.#events.push({
      name,
      at: new Date().toISOString(),
      runId,
    });
  }

  private async saveRun<TStage extends ConvergenceStage>(
    input: ConvergenceInput<TStage>,
    output: ConvergenceOutput<TStage>,
    constraints: readonly ConvergenceConstraint[],
  ): Promise<void> {
    const trace = toConstraintTrace(input.runId, constraints, [output.stage]);
    const payload = collectConstraintPayload([trace]);

    await this.#store.save({
      runId: input.runId,
      tenantId: input.tenantId,
      scope: input.scope,
      stage: output.stage,
      output,
      constraints,
      events: trace.trace,
      diagnostics: [...output.diagnostics, ...payload.map((entry) => String(entry))],
      createdAt: new Date().toISOString(),
    });
    this.record('save', input.runId);
  }

  private buildTopology(
    scope: ConvergenceScope,
    tenantId: TenantId,
    signals: readonly string[],
  ) {
    const root = createWorkloadId(`${tenantId}:${scope}:root`);
    const signalNodes = signals.map((signal, index) => ({
      id: createWorkloadId(`${tenantId}:${scope}:${index}:${signal}`),
      name: signal,
      ownerTeam: 'recovery-stress-orchestrator',
      criticality: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      active: true,
    }));

    return {
      tenantId,
      nodes: [
        {
          id: root,
          name: `${scope}:topology`,
      ownerTeam: 'recovery-stress-orchestrator',
          criticality: 5 as 1 | 2 | 3 | 4 | 5,
          active: true,
        },
        ...signalNodes,
      ],
      edges: signalNodes.map((signalNode, index) => ({
        from: root,
        to: signalNode.id,
        coupling: Math.max(0.1, signals.length - index) / Math.max(1, signals.length),
        reason: signalNode.name,
      })),
    };
  }

  private buildSignals(
    tenantId: TenantId,
    scope: ConvergenceScope,
    signals: readonly string[],
  ): readonly RecoverySignal[] {
    return signals.map((signal, index) => ({
      id: createSignalId(`${tenantId}:${scope}:${index}:${signal}`),
      class: index % 4 === 0
        ? 'availability'
        : index % 4 === 1
          ? 'integrity'
          : index % 4 === 2
            ? 'performance'
            : 'compliance',
      severity: index % 4 === 0 ? 'low' : index % 4 === 1 ? 'medium' : index % 4 === 2 ? 'high' : 'critical',
      title: `${scope}:${signal}`,
      createdAt: new Date(Date.now() - index * 60000).toISOString(),
      metadata: {
        tenant: tenantId,
        scope,
        index,
      },
    }));
  }

  private buildRunbooks(tenantId: TenantId, runbooks: readonly string[]): readonly CommandRunbook[] {
    return runbooks.map((runbook, index) => ({
      id: createRunbookId(`${tenantId}:runbook:${index}:${runbook}`),
      tenantId,
      name: runbook,
      description: `Recovery playbook ${runbook}`,
      steps: [
        {
          commandId: createStepId(`${tenantId}:step:${runbook}:init`),
          title: `${runbook}:init`,
          phase: 'observe',
          estimatedMinutes: 1,
          prerequisites: [],
          requiredSignals: [
            createSignalId(`${tenantId}:signal:${runbook}:observe`),
          ],
        },
        {
          commandId: createStepId(`${tenantId}:step:${runbook}:mitigate`),
          title: `${runbook}:mitigate`,
          phase: 'migrate',
          estimatedMinutes: 2,
          prerequisites: [createStepId(`${tenantId}:step:${runbook}:init`)],
          requiredSignals: [
            createSignalId(`${tenantId}:signal:${runbook}:mitigate`),
          ],
        },
      ],
      ownerTeam: 'recovery-stress-orchestrator',
      cadence: {
        weekday: index % 7,
        windowStartMinute: 120,
        windowEndMinute: 240,
      },
    }));
  }

  async execute<TStage extends ConvergenceStage>(
    input: RuntimeInput<ConvergenceScope, TStage>,
  ): Promise<RuntimeOutput> {
    const tenant = createTenantId(input.tenantId);
    const topology = this.buildTopology(input.scope, tenant, input.signals);
    const base = createTenantRunInput(tenant, topology, input.scope);
    const constrained = input.signals.map((signal, index) => createConstraintId(input.scope, `${signal}:${index}`));
    const activeSignals = this.buildSignals(tenant, input.scope, input.signals);
    const activeRunbooks = this.buildRunbooks(tenant, input.runbooks);

    const workflowInput: ConvergenceInput<TStage> = {
      ...base,
      stage: input.stage,
      signals: activeSignals,
      activeRunbooks,
      anchorConstraints: input.signals.map((signal, index) => ({
        id: constrained[index % constrained.length] ?? createConstraintId(input.scope, signal),
        scope: input.scope,
        key: signal,
        weight: Math.max(0.05, Math.min(1, 0.2 + index * 0.01)),
        active: index % 2 === 0,
      })),
      requestedAt: new Date().toISOString(),
    };

    const run = await runConvergenceWorkflow(
      bootstrapCatalog,
      workflowInput,
      ['input', 'resolve', 'simulate', 'recommend', 'report'],
    );

    const output = run.output;
    const constraints: readonly ConvergenceConstraint[] = [
      ...run.summary.diagnostics.map((diagnostic, index) => ({
        id: createConstraintId(input.scope, `${run.input.runId}:${index}`),
        scope: input.scope,
        key: diagnostic,
        weight: Math.max(0, Math.min(1, 0.5 + index * 0.07)),
        active: index % 2 === 0,
      } satisfies ConvergenceConstraint)),
      ...run.summary.diagnostics.map((diagnostic, index) => ({
        id: createConstraintId(input.scope, `runtime:${diagnostic}`),
        scope: input.scope,
        key: diagnostic,
        weight: Math.max(0.1, 1 - index * 0.02),
        active: index % 3 !== 0,
      } satisfies ConvergenceConstraint)),
    ];

    await this.saveRun(workflowInput, output, constraints);
    this.record('execute', run.input.runId);

    if (input.scope === 'signal') {
      await runLatticeCompileChain(workflowInput);
    }

    return {
      runId: run.input.runId,
      manifestDigest: `${run.summary.traceDigest}:${constraints.length}`,
      output,
      constraints,
      timeline: [...this.#events.map((entry) => `${entry.name}@${entry.at}`)],
    };
  }
}

export const runOrchestratedConvergence = async (
  tenantId: string,
  scope: ConvergenceScope,
  signalNames: readonly string[] = [],
): Promise<RuntimeOutput> => {
  await using session = new AsyncDisposableStack();
  const runtime = new ConvergenceRuntimeSession(tenantId);
  session.defer(async () => {
    await runtime[Symbol.asyncDispose]();
  });

  return runtime.execute({
    tenantId,
    scope,
    stage: 'input',
    signals: signalNames,
    runbooks: ['recovery-playbook-single'],
  });
};

export const runSequence = async (
  tenantId: string,
  scopes: readonly ConvergenceScope[] = ['tenant', 'topology', 'signal', 'policy', 'fleet'],
): Promise<{ readonly tenantId: string; readonly runs: readonly RuntimeOutput[]; readonly manifest: RuntimeManifest }> => {
  const outputs: RuntimeOutput[] = [];

  for (const scope of scopes) {
    const sessionOutput = await runOrchestratedConvergence(tenantId, scope, ['capacity', 'latency']);
    outputs.push(sessionOutput);
  }

  return {
    tenantId,
    runs: outputs,
    manifest: {
      tenantId,
      stage: 'report',
      scope: 'tenant',
      planCount: outputs.length,
      pluginCount: outputs.reduce((acc, output) => acc + output.constraints.length, 0),
    },
  };
};

export class ConvergenceRuntimeService {
  async *stream(input: RuntimeInput): AsyncIterable<RuntimeOutput> {
    const initial = await runOrchestratedConvergence(input.tenantId, input.scope, input.signals);
    yield initial;

    const stagedSignals = [...new Set([...input.signals, `signal:${input.scope}`])];
    for (const stage of ['resolve', 'simulate', 'recommend', 'report'] as const) {
      yield await runOrchestratedConvergence(input.tenantId, input.scope, [...stagedSignals, stage]);
    }
  }
}

export const getRuntimeService = (): ConvergenceRuntimeService => new ConvergenceRuntimeService();

export const buildRuntimeManifest = async (tenantId: string): Promise<RuntimeManifest> => {
  const run = await runSequence(tenantId);
  const latest = run.runs.at(-1);
  return {
    tenantId,
    stage: latest?.output.stage ?? 'report',
    scope: 'tenant',
    planCount: run.runs.length,
    pluginCount: run.runs.reduce((acc, item) => acc + item.constraints.length, 0),
  };
};
