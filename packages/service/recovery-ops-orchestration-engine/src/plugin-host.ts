import type { Brand } from '@shared/type-level';
import { randomUUID } from 'node:crypto';
import { ok, fail, type Result } from '@shared/result';
import type {
  OrchestrationLab,
  OrchestrationPolicy,
  OrchestrationLabEnvelope,
  LabPlan,
  PlanScore,
} from '@domain/recovery-ops-orchestration-lab';
import {
  createMetricEvent,
  attachMetricEvent,
  buildPolicyTag,
  buildRuntimeTrace,
  type PlanRuntimeTrace,
  type LabMetricEvent,
  type RuntimeIntent,
} from '@domain/recovery-ops-orchestration-lab/src/contracts';
import {
  createPluginId,
  PluginRegistry,
  PluginResult,
  type PluginStage,
  type PluginRunId,
  toPluginRegistry,
  type LabPluginDescriptor,
  type PluginExecutionTrace,
} from '@domain/recovery-ops-orchestration-lab/src/plugin-registry';
import {
  WorkbenchFactory,
  type WorkspaceResult,
  runWithPluginScope,
} from '@domain/recovery-ops-orchestration-lab/src/workbench';

export type PluginLease = Brand<string, 'PluginLeaseId'>;

export interface RuntimePluginHandle {
  readonly leaseId: PluginLease;
  readonly stage: PluginStage;
  readonly startedAt: string;
  [Symbol.dispose](): void;
}

export interface RuntimeManifest {
  readonly labId: string;
  readonly policy: OrchestrationPolicy;
  readonly plugins: readonly string[];
  readonly timestamp: string;
}

interface RuntimeHostState {
  tenant: string;
  trace: LabMetricEvent[];
  registry: PluginRegistry<readonly LabPluginDescriptor<object, object, object, object>[]>;
}

export interface HostRunContext {
  readonly contextId: string;
  readonly lab: OrchestrationLab;
  readonly selectedPlan?: LabPlan;
  readonly workspace: WorkspaceResult;
  readonly trace: PlanRuntimeTrace;
}

export type RuntimeResult = Result<{
  readonly intent: RuntimeIntent;
  readonly scores: readonly PlanScore[];
  readonly output: OrchestrationLabEnvelope;
}, Error>;

const makeLeaseId = (value: string): PluginLease => value as PluginLease;
const makePluginRunId = (value: string): PluginRunId => value as PluginRunId;

const buildIntent = (phase: string, source: string): RuntimeIntent<{ label: string; enabled: boolean }, boolean> => ({
  name: `${phase}:${source}`,
  input: {
    label: `${phase}:${source}`,
    enabled: true,
  },
  output: true,
  createdAt: new Date().toISOString(),
});

export const createEngineManifest = (
  tenant: string,
  policy: OrchestrationPolicy,
  plugins: readonly string[],
): RuntimeManifest => ({
  labId: `${tenant}:${Date.now()}`,
  policy,
  plugins,
  timestamp: new Date().toISOString(),
});

const buildPlugins = (): PluginRegistry<readonly LabPluginDescriptor<object, object, object, object>[]> => toPluginRegistry([
  {
    id: createPluginId('lab-plugin:signal-normalizer'),
    label: 'Signal normalizer',
    version: '1.0.0',
    supportedPhases: ['discover', 'score', 'simulate', 'verify'],
    config: {
      windowMinutes: 30,
      minimumScore: 0.2,
    },
    execute: async (event): Promise<PluginResult<{ signalCount: number }>> => ({
      output: {
        signalCount: (event.input as { signals?: readonly unknown[] } | undefined)?.signals?.length ?? 0,
      },
      trace: {
        stage: event.phase,
        plugin: event.plugin,
        status: 'ok',
        elapsedMs: 0,
        notes: ['signal-counting'],
      },
    }),
  },
  {
    id: createPluginId('lab-plugin:risk-calculator'),
    label: 'Risk calculator',
    version: '1.1.0',
    supportedPhases: ['simulate', 'execute', 'verify'],
    config: {
      windowMinutes: 10,
      includeWarnings: true,
    },
    execute: async (event): Promise<PluginResult<{ riskScore: number }>> => ({
      output: {
        riskScore: Number((event.input as { signals?: readonly unknown[] } | undefined)?.signals?.length ?? 0),
      },
      trace: {
        stage: event.phase,
        plugin: event.plugin,
        status: 'ok',
        elapsedMs: 1,
        notes: ['risk-score'],
      },
    }),
  },
]);

export class LabOrchestrationHost {
  private readonly state: RuntimeHostState;
  private readonly leases = new Map<PluginLease, RuntimePluginHandle>();
  private readonly workbench = new WorkbenchFactory();

  constructor(private readonly policy: OrchestrationPolicy) {
    this.state = {
      tenant: policy.tenantId,
      trace: [],
      registry: buildPlugins(),
    };
  }

  mount(phase: PluginStage): RuntimePluginHandle {
    const leaseId = makeLeaseId(`host:${phase}:${randomUUID()}`);
    const leases = this.leases;

    const lease: RuntimePluginHandle = {
      leaseId,
      stage: phase,
      startedAt: new Date().toISOString(),
      [Symbol.dispose](): void {
        leases.delete(leaseId);
      },
    };

    this.leases.set(leaseId, lease);
    return lease;
  }

  async run(tenant: string, lab: OrchestrationLab): Promise<RuntimeResult> {
    try {
      const planLease = this.mount('execute');
      using _planLease = planLease;
      const workspace = this.workbench.create(tenant, lab, this.policy);
      const selectedPlan = workspace.planSequence[0];
      const trace = buildRuntimeTrace(selectedPlan, buildPolicyTag('policy-tag', 0));

      const output: OrchestrationLabEnvelope = {
        id: `${lab.id}:host:${randomUUID()}` as OrchestrationLabEnvelope['id'],
        state: lab.plans[0]?.state ?? 'draft',
        lab,
        intent: {
          tenantId: lab.tenantId,
          siteId: 'site-1',
          urgency: lab.signals.some((signal) => signal.tier === 'critical') ? 'critical' : 'normal',
          rationale: 'host-run',
          owner: tenant,
          requestedAt: new Date().toISOString(),
          tags: ['host'],
        },
        plans: lab.plans,
        windows: lab.windows,
        metadata: {
          runId: randomUUID(),
          workspace: workspace.workspaceId,
          phase: 'execute',
        },
        revision: lab.plans.length,
      };

      const pluginRuns = await this.state.registry.executePhase(
        'execute',
        {
          workspace,
          policy: this.policy,
          diagnostics: this.state.trace,
          runId: output.id,
        },
        {
          signals: lab.signals,
          planId: selectedPlan?.id,
        },
        makePluginRunId(`${output.id}:${randomUUID()}`),
      );

      const score = pluginRuns
        .map((entry: PluginResult & { trace: PluginExecutionTrace }) => entry.trace.elapsedMs)
        .reduce((acc, value) => acc + value, 0);

      const metric = createMetricEvent(lab, 'score', Number((score / Math.max(pluginRuns.length, 1)).toFixed(2)));
      const traceState = attachMetricEvent(trace, metric);
      this.state.trace = [...this.state.trace, ...traceState.metrics];

      const scoreProfile: PlanScore = {
        labId: lab.id,
        planId: selectedPlan?.id ?? (lab.plans[0]?.id ?? `${lab.id}:fallback`),
        readiness: Number(traceState.metrics.length > 0),
        resilience: 0.8,
        complexity: 0.2,
        controlImpact: 0.1,
        timestamp: new Date().toISOString(),
      };

      return ok({
        intent: buildIntent('host-intent', tenant),
        scores: [
          scoreProfile,
          {
            labId: lab.id,
            planId: scoreProfile.planId,
            readiness: 0,
            resilience: 0.75,
            complexity: 0.5,
            controlImpact: score > 0 ? score : 0.2,
            timestamp: new Date().toISOString(),
          },
        ],
        output,
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('lab-host-run-failed'));
    }
  }

  async dispose(): Promise<void> {
    for (const entry of this.leases.values()) {
      entry[Symbol.dispose]();
    }
    this.leases.clear();
  }

  [Symbol.dispose](): void {
    void this.dispose();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }
}

export const buildHostWorkspace = async (
  policy: OrchestrationPolicy,
  tenant: string,
  lab: OrchestrationLab,
): Promise<RuntimeResult> => {
  using host = new LabOrchestrationHost(policy);
  return host.run(tenant, lab);
};

export const runScoped = async (
  policy: OrchestrationPolicy,
  tenant: string,
  lab: OrchestrationLab,
): Promise<RuntimeResult> => {
  const registry = buildPlugins();
  const workspace = {
    workspaceId: `${tenant}-${Date.now()}`,
    tenant,
    policy,
    policyDigest: 'digest',
    startedAt: new Date().toISOString(),
  };

  return runWithPluginScope(
    workspace,
    { id: policy.id },
    registry,
    { ...lab },
    async (state, payload) => {
      const host = new LabOrchestrationHost(policy);
      using _hostHandle = {
        [Symbol.dispose](): void {
          void host.dispose();
        },
      };
      const result = await host.run(state.tenant, payload as OrchestrationLab);
      const executeCandidates = registry.candidatesForPhase('execute');
      const manifest = createEngineManifest(
        state.tenant,
        policy,
        executeCandidates.map((entry) => String(entry.id)),
      );
      const traceRecord = buildIntent('runScoped', state.tenant);
      if (!result.ok) {
        return fail(new Error('scoped-failed'));
      }

      return ok({
        ...result.value,
        intent: {
          ...traceRecord,
          input: {
            ...traceRecord.input,
            manifest,
            workspace: state.workspaceId,
          },
          output: payload,
        },
      });
    },
  );
};
