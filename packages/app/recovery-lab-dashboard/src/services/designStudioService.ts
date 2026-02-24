import {
  asLabPluginId,
  asLabRunId,
  asLabScenarioId,
  asLabTenantId,
} from '@shared/recovery-lab-kernel';
import {
  type LabExecution,
  type LabExecutionResult,
  type LabLane,
  type LabScenario,
  type LabSignal,
} from '@domain/recovery-simulation-lab-core';
import {
  createDesignOrchestrator,
  type DesignDiagnostic,
  type DesignPlanId,
  type DesignSignalKind,
  type DesignStage,
  builtinTemplates,
  makeDesignPlanId,
  makeDesignTenantId,
  makeDesignWorkspaceId,
} from '@domain/recovery-orchestration-design';
import { buildSignalWindows, toSignalRoute } from '@domain/recovery-orchestration-design';

interface SignalWindow {
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly average: number;
}

interface LabTemplate {
  readonly templateId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scenarioId: string;
  readonly phases: readonly DesignStage[];
  readonly tags: readonly string[];
  readonly labels: readonly string[];
}

interface StoredSignal {
  readonly metric: DesignSignalKind;
  readonly value: number;
  readonly stage: DesignStage;
  readonly timestamp: string;
}

const signalBucketsKey = (tenant: string, workspace: string): string => `${tenant}|${workspace}`;
const defaultScenarios: readonly LabTemplate[] = builtinTemplates.map((template) => ({
  templateId: template.templateId,
  tenantId: template.tenantId,
  workspaceId: template.workspaceId,
  scenarioId: template.scenarioId,
  phases: template.phases,
  tags: template.tags,
  labels: [...template.tags, template.templateId],
}));

const parseSeedTemplates = (tenant: string, workspace: string): readonly LabTemplate[] =>
  defaultScenarios
    .filter((entry) => String(entry.tenantId).includes(tenant) || String(entry.workspaceId).includes(workspace))
    .map((template) => ({ ...template, workspaceId: workspace }));

export interface DesignStudioWorkspace {
  readonly tenant: string;
  readonly workspace: string;
  readonly templates: readonly LabTemplate[];
  readonly scenarios: readonly LabScenario[];
  readonly latestPlanId: string | null;
  readonly lastRunId: string | null;
  readonly diagnostic: readonly string[];
  readonly eventLog: readonly string[];
}

export interface DesignStudioSignalStream {
  readonly runId: string;
  readonly lane: DesignSignalKind;
  readonly windows: readonly SignalWindow[];
  readonly latestSignalCount: number;
  readonly diagnostics: readonly DesignDiagnostic[];
}

export interface StudioHookState {
  readonly loading: boolean;
  readonly workspace: DesignStudioWorkspace;
  readonly runs: readonly string[];
  readonly signals: readonly LabSignal[];
  readonly message: string;
}

interface BucketState {
  readonly key: string;
  readonly signals: readonly StoredSignal[];
}

class DesignStudioService {
  readonly #orchestrator = createDesignOrchestrator({
    plugins: [],
    config: { maxConcurrency: 4, clientMode: 'read-write' },
  });
  readonly #signalBuckets = new Map<string, BucketState>();

  async bootstrapTenant(tenant: string, workspace: string): Promise<void> {
    await this.#orchestrator.bootstrap(tenant, workspace);
    const templates = parseSeedTemplates(tenant, workspace);
    for (const template of templates) {
      try {
        await this.#orchestrator.createPlan(tenant, workspace, template.scenarioId, template.phases.at(0) ?? 'intake');
      } catch {
        // plan may already exist
      }
    }
  }

  async listWorkspace(tenant: string, workspace: string): Promise<DesignStudioWorkspace> {
    const templates = parseSeedTemplates(tenant, workspace);
    const scenarios: readonly LabScenario[] = templates.map((template, index) => {
      const lane: LabLane = index % 2 === 0 ? 'simulate' : 'restore';
      return {
        tenant: asLabTenantId(tenant),
        scenarioId: asLabScenarioId(`${tenant}:${template.scenarioId}:${index}`),
        lane,
        kind: 'disaster',
        labels: template.labels,
        objective: `${template.templateId}:objective`,
        signals: template.tags.map((name, offset) => ({
          name,
          lane,
          severity: offset > 1 ? 'high' : 'low',
          value: index + 1 + offset,
          createdAt: new Date().toISOString(),
        } satisfies LabSignal)),
      };
    });

    const rows = await this.#orchestrator.listPlans(tenant, workspace);
    const eventLog = rows
      .toSorted((left, right) => String(left.planId).localeCompare(String(right.planId)))
      .map((entry) => `plan:${entry.planId}`);

    return {
      tenant,
      workspace,
      templates,
      scenarios,
      latestPlanId: rows.at(0)?.planId ? String(rows.at(0)?.planId) : null,
      lastRunId: rows.at(-1)?.planId ? String(rows.at(-1)?.planId) : null,
      diagnostic: ['initialized'],
      eventLog,
    };
  }

  async runPlan(tenant: string, workspace: string, planId: string): Promise<LabExecutionResult> {
    const normalizedPlanId = this.#normalizePlanId(planId, tenant, workspace);
    const runId = await this.#ensurePlanId(normalizedPlanId, tenant, workspace);
    const execution = await this.#orchestrator.execute(runId);
    const windows = buildSignalWindows(execution.signals, 4);
    await this.#storeSignalTrace(workspace, normalizedPlanId, windows);

    const scenarioId = asLabScenarioId(`${tenant}:${execution.plan.scenarioId}`);
    const labExecution: LabExecution = {
      executionId: asLabRunId(`${tenant}:${runId}:${Date.now()}`),
      tenant: asLabTenantId(tenant),
      scenarioId,
      pluginIds: [asLabPluginId(`plugin:${tenant}:${workspace}:design`)],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      lane: 'simulate',
    };

    return {
      context: {
        tenant: asLabTenantId(tenant),
        traceId: `${tenant}:${runId}`,
        runId: asLabRunId(`${tenant}:${planId}:${Date.now()}`),
        initiatedBy: 'dashboard',
        startedAt: Date.now(),
        workspace,
      },
      execution: labExecution,
      steps: [],
      health: windows.length ? Math.max(0.01, 1 - windows.length * 0.1) : 0,
      status: execution.signals.length > 0 ? 'passed' : 'running',
      telemetry: {
        runId: asLabRunId(`${tenant}:${planId}:${Date.now()}`),
        tenant,
        events: execution.signals.length,
        metrics: {
          signalCount: execution.signals.length,
          windowCount: windows.length,
        },
        emitted: windows.map((entry) => `window:${entry.count}`),
      },
    };
  }

  async signalStream(tenant: string, workspace: string, metric: DesignSignalKind): Promise<DesignStudioSignalStream> {
    const signals = this.#signalBuckets.get(signalBucketsKey(tenant, workspace))?.signals ?? [];
    const filtered = signals.filter((signal) => signal.metric === metric);
    const windows = buildSignalWindows(
      filtered.map((entry, index) => ({
        runId: makeDesignPlanId(makeDesignTenantId(tenant), makeDesignWorkspaceId(workspace), `signal-${index}`),
        metric: entry.metric,
        stage: entry.stage,
        id: `${tenant}:${workspace}:${entry.timestamp}:${entry.value}`,
        value: entry.value,
        timestamp: entry.timestamp,
        path: toSignalRoute(entry.metric, entry.stage),
      })),
      2,
    );
    const diagnostics = await this.#orchestrator.stats();
    const planRows = await this.#orchestrator.listPlans(tenant, workspace);

    return {
      runId: `${tenant}:${workspace}:${planRows.at(0)?.planId ?? 'none'}`,
      lane: metric,
      windows: windows.map((window) => ({
        from: window.from,
        to: window.to,
        count: window.count,
        average: window.average,
      })),
      latestSignalCount: filtered.length,
      diagnostics: [
        {
          scope: 'design/diagnostics',
          kind: 'design/runtime',
          message: `${metric}:${diagnostics.totalStoredPlans}`,
          details: {
            queueDepth: diagnostics.queueDepth,
            running: diagnostics.runningCount,
            windows: planRows.length,
          },
        },
      ],
    };
  }

  async hydrate(tenant: string, workspace: string): Promise<StudioHookState> {
    const workspaceState = await this.listWorkspace(tenant, workspace);
    const rows = await this.#orchestrator.listPlans(tenant, workspace);
    const bucketSignals = this.#signalBuckets.get(signalBucketsKey(tenant, workspace))?.signals ?? [];

    return {
      loading: false,
      workspace: workspaceState,
      runs: rows.map((entry) => entry.planId),
      signals: bucketSignals.map((signal) => ({
        name: `seed:${signal.metric}`,
        lane: signal.stage === 'intake' ? 'simulate' : 'restore',
        severity: signal.value > 0.75 ? 'critical' : signal.value > 0.5 ? 'high' : 'low',
        value: signal.value,
        createdAt: signal.timestamp,
      })),
      message: `hydrated:${tenant}:${workspace}`,
    };
  }

  async recordSignal(tenant: string, workspace: string, signal: { readonly metric: DesignSignalKind; readonly value: number; readonly stage: DesignStage }): Promise<void> {
    const key = signalBucketsKey(tenant, workspace);
    const prev = this.#signalBuckets.get(key);
    const staged: StoredSignal = {
      metric: signal.metric,
      stage: signal.stage,
      value: signal.value,
      timestamp: new Date().toISOString(),
    };
    this.#signalBuckets.set(key, {
      key,
      signals: [...(prev?.signals ?? []), staged],
    });
    await this.#orchestrator.bootstrap(tenant, workspace);
    void toSignalRoute(signal.metric, signal.stage);
  }

  async bootstrapPlugins(_plugins: readonly unknown[]): Promise<void> {
    await this.bootstrapTenant('tenant-bootstrap', 'workspace-default');
  }

  async #storeSignalTrace(_workspace: string, _planId: string, windows: readonly { readonly count: number }[]): Promise<void> {
    void windows;
  }

  async #ensurePlanId(planId: string, tenant: string, workspace: string): Promise<DesignPlanId> {
    try {
      await this.#orchestrator.execute(planId as DesignPlanId);
      return planId as DesignPlanId;
    } catch {
      const [, , fallbackScenario] = planId.split(':');
      return makeDesignPlanId(makeDesignTenantId(tenant), makeDesignWorkspaceId(workspace), fallbackScenario ?? 'replay');
    }
  }

  #normalizePlanId(planId: string, tenant: string, workspace: string): string {
    const chunks = planId.split(':');
    if (chunks.length >= 3) {
      return planId;
    }
    return `${tenant}:${workspace}:${chunks[0]}`;
  }
}

export const designStudioService = new DesignStudioService();

export const buildWorkspaceKey = (tenant: string, workspace: string): string => `${tenant}::${workspace}`;
export const asDesignTemplate = (seed: { readonly templateId: string }): string => seed.templateId;
export const buildRunKey = (tenant: string, workspace: string, stage: DesignStage): string => `${tenant}|${workspace}|${stage}`;
export const planSignature = (planId: string, stage: DesignStage): `${string}:${DesignStage}` => `${planId}:${stage}`;

export const collectSignalsByMetric = <TMetric extends DesignSignalKind>(
  signals: readonly StoredSignal[],
  metric: TMetric,
): readonly StoredSignal[] => signals.filter((signal) => signal.metric === metric);

export const mergeDiagnostics = (...diagnostics: readonly (readonly string[] | string)[]): readonly string[] =>
  [...diagnostics].flatMap((entry) => (typeof entry === 'string' ? [entry] : [...entry]));
