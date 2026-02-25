import {
  asChroniclePlanId,
  asChronicleRoute,
  buildBlueprint,
  type ChronicleBlueprint,
  type TimelineLane,
} from '@domain/recovery-chronicle-core';
import { asChronicleTenantId } from '@domain/recovery-chronicle-core';
import { buildDiagnostics } from './diagnostics';
import {
  buildRunId,
  buildTrace,
  defaultPolicy,
  type OrchestrateRequest,
  type OrchestratedRun,
  type OrchestratedStepResult,
  type OrchestrationDiagnostic,
  type OrchestrationMode,
  type OrchestrationPolicy,
  type OrchestrationRunContext,
  type OrchestrationStage,
  type OrchestrationStageDescriptor,
  type OrchestrationStageInput,
  type OrchestrationId,
} from './types';
import { OrchestrationPluginRegistry } from './plugin-registry';
import { buildTopology } from './topology';
import { buildSchedule } from './scheduler';
import { withRuntimeContext } from './runtime';

const asNumber = (value: number) => Number.parseFloat(value.toFixed(2));

type DescriptorInput = OrchestrationStageInput<OrchestrationStage>;

const makeBlueprint = (
  runId: string,
  run: { readonly context: OrchestrationRunContext; readonly output: readonly OrchestratedStepResult[] },
): ChronicleBlueprint => {
  const route = asChronicleRoute(`run:${runId}`);
  const template = run.output.map((entry, index) => ({
    phaseName: `${entry.stage}.${index}`,
    lane: (index % 2 === 0 ? 'control' : 'policy') as TimelineLane,
    label: `${entry.stage}:${entry.status}`,
    weight: Math.max(1, entry.score),
  }));

  return buildBlueprint({
    tenant: run.context.tenant,
    title: `run ${runId}`,
    route,
    tags: [run.context.policyId.toString(), runId],
    template,
    planId: runId,
  });
};

const buildDescriptor = (policy: OrchestrationPolicy, stage: OrchestrationStage): OrchestrationStageDescriptor => {
  return {
    stage,
    supports: [`channel:${stage}` as const],
    id: (`descriptor:${policy.id}:${stage}` as unknown) as OrchestrationId,
    version: '1.0.0',
    mode: policy.mode,
    weight: 10,
    execute: async (input: DescriptorInput) => {
      const startedAt = Date.now();
      const traceId = buildRunId(asChronicleTenantId('descriptor-trace'), asChronicleRoute('diagnostic'));
      const output =
        stage === 'bootstrap'
          ? (() => {
              const { warmupMs } = input.payload as unknown as { readonly warmupMs: number };
              return {
                readiness: asNumber(warmupMs / 100 + 0.8),
                planId: asChroniclePlanId(policy.tenant, asChronicleRoute('bootstrap')),
              };
            })()
          : stage === 'policy'
            ? (() => {
                const { policyId, threshold, constraints } = input.payload as unknown as {
                  readonly policyId: string;
                  readonly threshold: number;
                  readonly constraints: readonly string[];
                };
                return {
                  allowed: policyId !== undefined,
                  score: asNumber(90 - threshold * 10),
                  tags: constraints,
                };
              })()
            : stage === 'telemetry'
              ? (() => {
                  const { samples } = input.payload as unknown as { readonly samples: readonly number[] };
                  return {
                    events: samples.map((sample: number) => `event:${sample}`),
                    emitted: samples.length,
                    quality: asNumber(samples.length / 10),
                  };
                })()
              : (() => {
                  const { finalizedBy } = input.payload as unknown as { readonly finalizedBy: string };
                  return {
                    finalized: true,
                    summary: `finalized ${finalizedBy}`,
                    confidence: 0.99,
                  };
                })();

      return {
        output,
        trace: buildTrace(traceId, [stage]),
        status: 'ok',
        latencyMs: asNumber(Date.now() - startedAt),
      };
    },
  };
};

export const executeChronicleOrchestration = async (request: OrchestrateRequest): Promise<{
  readonly run: OrchestratedRun;
  readonly topology: ReturnType<typeof buildTopology>;
  readonly diagnostics: readonly OrchestrationDiagnostic[];
}> => {
  const policy = request.policy ?? defaultPolicy(request.tenant);
  const tenant = asChronicleTenantId(request.tenant);
  const route = asChronicleRoute(request.planId);
  const runId = buildRunId(tenant, route);
  const descriptors: readonly OrchestrationStageDescriptor[] = policy.stages.map((stage) => buildDescriptor(policy, stage));

  const topology = buildTopology(runId, policy.stages);
  const schedule = buildSchedule(descriptors, {
    tenant: request.tenant,
    policy,
    mode: request.mode ?? policy.mode,
  });

  const executed = await withRuntimeContext(request.tenant, policy, request.mode ?? policy.mode, async (context: OrchestrationRunContext) => {
    const trace = buildTrace(context.runId, schedule.order.map((descriptor) => descriptor.stage));
    const registry = new OrchestrationPluginRegistry(schedule.order, policy, trace);
    const output: readonly OrchestratedStepResult[] = await registry.run({}, context);
    return { context, output };
  });

  const run: OrchestratedRun = {
    runId,
    context: executed.context,
    blueprint: makeBlueprint(runId, executed),
    scenario: {
      id: asChroniclePlanId(tenant, route),
      tenant,
      route,
    },
    output: executed.output,
    durationMs: executed.output.reduce((acc, output) => acc + output.latencyMs, 0),
    status: 'succeeded',
  };

  const diagnostics = buildDiagnostics(runId, executed.output);
  return { run, topology, diagnostics };
};

export const executeChronicleOrchestrationByTenant = (tenant: string, planId: string, mode: OrchestrationMode = 'adaptive') =>
  executeChronicleOrchestration({ tenant, planId, mode });
