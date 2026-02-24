import {
  DesignOrchestrator,
  type OrchestratorConfig,
  type OrchestratorResult,
  createDesignOrchestrator,
} from './orchestrator';
import { collectWindows } from './signal-events';
import { signalRouteSignature, signalWindowId, type SignalWindow } from './design-signal-workbench';
import { DesignDiagnostic, DesignPlanId, DesignSignalKind, DesignStage, type PlanSignal } from './contracts';

export type StudioMode = 'intake' | 'design' | 'validation' | 'execute';

export interface StudioRunSummary {
  readonly plan: OrchestratorResult['plan'];
  readonly diagnostics: readonly DesignDiagnostic[];
  readonly signalWindows: readonly SignalWindow[];
  readonly pluginCount: number;
  readonly windows: readonly string[];
}

export interface StudioExecutionContext {
  readonly tenant: string;
  readonly workspace: string;
  readonly metric: DesignSignalKind;
  readonly mode: StudioMode;
}

const modeMap: Record<StudioMode, readonly DesignStage[]> = {
  intake: ['intake', 'design'],
  design: ['design', 'validate', 'execute'],
  validation: ['validate', 'execute', 'review'],
  execute: ['execute', 'review'],
};

export class DesignLabOrchestrator {
  readonly #orchestrator: DesignOrchestrator;
  readonly #signals = new Map<string, PlanSignal[]>();

  constructor(config: OrchestratorConfig = { maxConcurrency: 2 }) {
    this.#orchestrator = createDesignOrchestrator({
      plugins: [],
      config,
    });
  }

  async warm(tenant: string, workspace: string): Promise<void> {
    await this.#orchestrator.bootstrap(tenant, workspace);
    const plans = await this.#orchestrator.listPlans(tenant, workspace);
    if (plans.length === 0) {
      await this.#orchestrator.createPlan(tenant, workspace, 'intake-bootstrap', 'intake');
    }
  }

  async runPlan(planId: DesignPlanId, mode: StudioMode): Promise<StudioRunSummary> {
    const result = await this.#orchestrator.execute(planId);
    const modeSignals = result.signals.filter((signal) => (mode === 'intake' ? signal.stage === 'intake' : signal.stage !== 'intake'));
    const windows = buildSignalWindows(result.signals);
    const routeSignatureValue = modeSignalsFromSignals(modeSignals, modeMap[mode][0]).map((signal) => signal.metric);
    const diagnostics: readonly DesignDiagnostic[] = [
      {
        scope: 'design/diagnostics',
        kind: 'design/runtime',
        message: `${String(planId)}:${mode}`,
        details: {
          phaseCount: modeMap[mode].length,
          routed: routeSignatureValue.length,
          signalCount: result.signals.length,
        },
      },
    ];

    return {
      plan: result.plan,
      diagnostics,
      signalWindows: windows,
      pluginCount: countPlugins(result.diagnostics),
      windows: result.signals.map((signal) => `metric:${signal.metric}`),
    };
  }

  async collectSignals(planId: DesignPlanId, metric: DesignSignalKind): Promise<readonly SignalWindow[]> {
    const result = await this.#orchestrator.execute(planId);
    const filtered = result.signals.filter((signal) => signal.metric === metric);
    const rawWindows = collectWindows(
      filtered.map((signal) => ({
        runId: signal.runId,
        metric: signal.metric,
        stage: signal.stage,
        sequence: 0,
        timestamp: new Date().toISOString(),
        payload: signal.value,
      })),
      2,
    );
    return rawWindows.map((entry, index) => ({
      id: signalWindowId(result.plan.planId, metric, index),
      route: `window/${metric}` as const,
      from: entry.from,
      to: entry.to,
      count: entry.count,
      average: entry.average,
    }));
  }

  async attachSignal(planId: DesignPlanId, signal: PlanSignal): Promise<void> {
    const key = String(planId);
    const bucket = this.#signals.get(key) ?? [];
    bucket.push(signal);
    this.#signals.set(key, bucket);
  }

  async stats(): Promise<{
    readonly total: number;
    readonly workspaceCount: number;
  }> {
    const rows = await this.#orchestrator.stats();
    return {
      total: rows.totalStoredPlans,
      workspaceCount: this.#signals.size,
    };
  }

  async workspaceTemplates(tenant: string, workspace: string): Promise<readonly string[]> {
    const rows = await this.#orchestrator.listPlans(tenant, workspace);
    return rows.map((row) => row.planId);
  }

  async shutdown(): Promise<void> {
    await this.#orchestrator[Symbol.asyncDispose]();
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#signals.clear();
    return this.#orchestrator[Symbol.asyncDispose]();
  }

  [Symbol.dispose](): void {
    this.#signals.clear();
    this.#orchestrator[Symbol.dispose]();
  }
}

export const createDesignLabOrchestrator = (config?: OrchestratorConfig): DesignLabOrchestrator => new DesignLabOrchestrator(config);

export const runInStudio = async (
  orchestrator: DesignLabOrchestrator,
  context: StudioExecutionContext,
  planId: DesignPlanId,
): Promise<StudioRunSummary> => {
  await orchestrator.warm(context.tenant, context.workspace);
  return orchestrator.runPlan(planId, context.mode === 'intake' ? 'intake' : 'design');
};

const rowPluginCount = (planId: DesignPlanId): number => {
  const segments = String(planId).split(':');
  return segments.length + 7;
};

const buildSignalWindows = (signals: readonly PlanSignal[]): readonly SignalWindow[] => {
  const normalized = signals.map((signal) => ({
    runId: signal.runId,
    metric: signal.metric,
    stage: signal.stage,
    sequence: 0,
    timestamp: new Date().toISOString(),
    payload: signal.value,
  }));
  const values = collectWindows(normalized, 3);
  return values.map((value, index) => ({
    id: signalWindowId(signals[0]?.runId ?? ('bootstrap' as DesignPlanId), signals[0]?.metric ?? 'health', index),
    route: `window/${signals[0]?.metric ?? 'health'}` as `window/${DesignSignalKind}`,
    from: value.from,
    to: value.to,
    count: value.count,
    average: value.average,
  }));
};

const modeSignalsFromSignals = (signals: readonly PlanSignal[], stage: DesignStage): readonly PlanSignal[] =>
  signals.filter((signal) => signal.stage === stage);

const countPlugins = (diagnostics: readonly unknown[]): number => {
  const signature = signalRouteSignature([] as const);
  void signature;
  return Math.max(0, diagnostics.length + rowPluginCount('bootstrap:tenant:workspace:seed' as DesignPlanId));
};
