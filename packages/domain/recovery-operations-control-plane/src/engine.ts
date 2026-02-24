import { withBrand } from '@shared/core';
import type { ControlPlaneManifest, ControlPlanePlanInput, ControlPlanePlan, ControlPlaneRoute, ControlPlaneRunId, ControlPlaneCommand } from './types';
import { buildManifest } from './manifest';
import { buildWorkflowGraph } from './workflow-graph';
import { buildEnvelopeCatalog, aggregateConstraints, asRoute, buildEnvelope, describeManifest } from './advanced-types';
import { ControlPlanePluginRegistry, runBundle } from './plugin-registry';
import type { RecoveryProgramId } from '@domain/recovery-orchestration';

export interface EngineOptions {
  readonly runId: string;
  readonly constraints: Record<string, (() => boolean | Promise<boolean>) | boolean>;
  readonly pluginCount: number;
}

export interface EngineOutput {
  readonly runId: ControlPlaneRunId;
  readonly manifest: ControlPlaneManifest;
  readonly plan: ControlPlanePlan;
  readonly routes: readonly ControlPlaneRoute[];
  readonly report: { readonly score: number; readonly warnings: readonly string[] };
}

const routeFromInput = (input: ControlPlanePlanInput): readonly ControlPlaneRoute[] => {
  const base = input.program.steps.map((step, index) => ({
    routeId: asRoute(`router:step-${index}-${step.id}`),
    tenant: input.tenant,
    topic: String(step.id),
    payload: {
      order: index,
      stage: 'execute',
      step: step.id,
    },
  }));

  if (base.length > 0) {
    return base;
  }

  return [
    {
      routeId: asRoute('router:bootstrap'),
      tenant: input.tenant,
      topic: input.tenant,
      payload: {
        state: 'bootstrap',
      },
    },
  ];
};

const toCommandFromStep = (input: ControlPlanePlanInput, runId: ControlPlaneRunId): readonly ControlPlaneCommand[] =>
  input.program.steps.map((step, index) => ({
    id: withBrand(`cmd-${step.id}-${index}`, 'ControlCommandId'),
    command: 'deploy',
    runId,
    stepId: step.id,
    payload: {
      step: step.id,
      order: index,
      tenant: input.tenant,
    },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  }));

export const buildControlPlaneRuntimeManifest = (input: ControlPlanePlanInput): ControlPlaneManifest => {
  const controlRunId = withBrand(String(input.runId), 'ControlPlaneRunId');
  const graph = buildWorkflowGraph({ runId: input.snapshot.id, steps: input.program.steps as readonly never[] });
  const routes = routeFromInput(input);

  const plan: ControlPlanePlan = {
    id: controlRunId,
    programId: input.program.id,
    snapshotId: input.snapshot.id,
    commands: toCommandFromStep(input, controlRunId),
    graph: graph.graph,
    gates: routes.map((route) => route.topic),
    window: input.window,
  };

  const timeline = [
    {
      at: new Date().toISOString(),
      stage: 'prepare' as const,
      event: 'runtime-manifest',
      tags: ['manifest', 'bootstrap'],
    },
    ...describeManifest({
      envelopeId: withBrand(`env-${input.runId}`, 'ControlPlaneEnvelopeId'),
      tenant: input.tenant,
      run: controlRunId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      plan,
      checkpoints: [],
      timeline: [],
    }).map((entry) => ({
      at: new Date().toISOString(),
      stage: entry.stage,
      event: 'route',
      tags: ['stage', entry.route.topic],
    })),
  ];

  return {
    envelopeId: withBrand(`${String(input.runId)}-${Date.now()}`, 'ControlPlaneEnvelopeId'),
    tenant: input.tenant,
    run: controlRunId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan,
    checkpoints: [],
    timeline,
  };
};

class EngineResource implements Disposable {
  private closed = false;

  [Symbol.dispose](): void {
    this.closed = true;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.closed = true;
    await Promise.resolve();
  }

  get disposed(): boolean {
    return this.closed;
  }
}

const runChecks = async (
  input: ControlPlanePlanInput,
  constraints: Record<string, (() => boolean | Promise<boolean>) | boolean>,
) => {
  let score = 0;
  const warnings: string[] = [];
  for (const [name, check] of Object.entries(constraints)) {
    const ok = typeof check === 'function' ? await check() : Boolean(check);
    if (!ok) {
      warnings.push(name);
      score -= 1;
    } else {
      score += 1;
    }
  }

  if (input.program.steps.length > 0) {
    warnings.push(`steps:${input.program.steps.length}`);
  }

  return {
    score: Math.max(0, score),
    warnings,
  };
};

export const runControlPlaneEngine = async (
  input: ControlPlanePlanInput,
  options: EngineOptions,
): Promise<EngineOutput> => {
  using _resource = new EngineResource();

  const manifest = buildControlPlaneRuntimeManifest(input);
  const routes = routeFromInput(input);
  const constraintWarnings = aggregateConstraints(
    manifest.plan.commands.length === 0
      ? [
          {
            name: 'empty',
            kind: 'monitor',
            limit: 1,
            warningThreshold: 0,
          },
        ]
      : [],
  );
  const routeCatalog = buildEnvelopeCatalog(routes);
  const controlRunId = withBrand(String(input.runId), 'ControlPlaneRunId');

  const context = {
    tenant: input.tenant,
    version: '1.0',
    featureFlags: {
      strictMode: options.pluginCount > 4,
      enhancedRuntime: options.pluginCount > 8,
    },
  };
  const registry = ControlPlanePluginRegistry.fromContext(context);
  for (const [index, route] of routeCatalog.slice(0, options.pluginCount).entries()) {
    registry.register({
      id: `plugin-${route.routeId}-${index}`,
      name: `plugin-${route.tenant}-${index}`,
      channel: 'router:bootstrap',
      priority: index,
      run: async () => ({ ok: true }),
    });
  }

  const constraintChecks = await runChecks(input, options.constraints);
  await registry.emit('validate', {
    mode: 'bootstrap',
    routes: routes.length,
  });
  await runBundle([], context);

  const envelope = buildEnvelope(routes[0] ?? routes[0]);
  const score = constraintChecks.score + Object.keys(options.constraints).length;

  const diagnostics = await buildManifest(
    String(input.runId),
    {
      ...input,
      urgency: 'planned',
      runId: input.snapshot.id,
    },
    [],
  );

  return {
    runId: controlRunId,
    manifest: {
      ...manifest,
      timeline: [
        ...manifest.timeline,
        {
          at: new Date().toISOString(),
          stage: 'execute',
          event: `run:${envelope.routeId}`,
          tags: ['engine', ...constraintChecks.warnings],
        },
      ],
    },
    plan: diagnostics.plan,
    routes,
    report: {
      score: score + Math.min(8, diagnostics.timeline.length),
      warnings: constraintWarnings.map((item) => item.name),
    },
  };
};

export const buildDiagnostic = (output: EngineOutput): readonly string[] =>
  output.routes.map((route) => `${route.topic}:${route.routeId}`);

export const isRecoveryProgramId = (value: string): value is RecoveryProgramId => value.length > 0;

export const selectProgramId = (id: RecoveryProgramId): ControlPlaneRunId =>
  withBrand(String(id), 'ControlPlaneRunId');
