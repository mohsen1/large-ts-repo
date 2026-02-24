import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  executePluginChain,
  type CompatibleChain,
  type PluginDefinition,
  type PluginId,
  PluginSession,
  pluginSessionConfigFrom,
  canonicalizeNamespace,
  collectIterable,
  toIterableIterator,
} from '@shared/stress-lab-runtime';
import {
  buildMeshContext,
  buildMeshEnvelope,
  buildMeshFingerprint,
  resolveManifestForLane,
  type MeshLane,
  type MeshMode,
  type MeshRunSeed,
  type MeshRuntimeEvent,
} from '@shared/orchestration-lab-core';
import {
  type ControlPlaneCommand,
  type ControlPlaneMode,
  type ControlPlaneRunId,
  type ControlPlaneSnapshot,
  type ControlPlaneTenantId,
  type MeshControlPlaneExecutionOutput,
  type MeshControlPlaneExecutionPlan,
  type MeshControlPlaneLaneWeights,
  type MeshControlPlaneLanePlan,
  type MeshControlPlaneTimelineEntry,
  type MeshControlPlaneTimelineInput,
  type MeshControlPlaneResult,
  type MeshControlPlaneTask,
  defaultPolicyTimeline,
  createMeshControlPlan,
  type ControlPlaneManifestHint,
  toControlRunId,
} from './types';
import { isControlEnabled, buildControlSignature, normalizeConfigTags } from './config';
import { MeshControlRegistry } from './registry';
import { aggregateEventSeries, buildEventFingerprint, rankPoliciesByWeight, summarizeControlSeries } from './telemetry';
import type { ControlPlaneConfig } from './config';

type NoInfer<T> = [T][T extends unknown ? 0 : never];
type CommandStage<TInput extends ControlPlaneCommand> = TInput['command'] extends `cp:${infer TStage}` ? TStage : 'unknown';
type ChainInput = Record<string, unknown>;

interface SessionState {
  readonly runId: ControlPlaneRunId;
  readonly sessionId: string;
  readonly tenantId: ControlPlaneTenantId;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly startedAt: string;
}

const emitEvent = (kind: string, value: number, tags: readonly string[]): MeshRuntimeEvent => ({
  kind: kind as MeshRuntimeEvent['kind'],
  value,
  at: new Date().toISOString(),
  tags,
});

const buildStageEvent = (runId: ControlPlaneRunId, stage: string): MeshRuntimeEvent =>
  emitEvent(`mesh.signal.latency`, stage.length, ['control-plane', runId]);

const commandWeight = (command: NoInfer<ControlPlaneCommand>): number =>
  Number(((command.command.split(':')[1]?.length ?? 1) / 10).toFixed(4));

export const compileExecutionPlan = <TInput extends readonly ControlPlaneCommand[]>(
  commands: TInput,
): readonly MeshControlPlaneTask[] =>
  commands.map((command, index) => ({
    id: `${index}-${command.command}-${Date.now()}` as const,
    command,
    order: index,
    weight: commandWeight(command),
  }));

export const normalizePlan = (plan: readonly MeshControlPlaneTask[]): readonly MeshControlPlaneTask[] =>
  plan.toSorted((left, right) => left.order - right.order);

export const createControlSession = (tenantId: string, name: string): string =>
  `${tenantId}::${name}::${randomUUID()}`;

export const toPlan = (input: {
  readonly tenantId: string;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly commands: readonly ControlPlaneCommand[];
  readonly weights: readonly MeshControlPlaneLaneWeights[];
  readonly tags: readonly string[];
}): MeshControlPlaneExecutionPlan => {
  const manifestHint: ControlPlaneManifestHint = {
    tenantId: input.tenantId,
    lane: input.lane,
    mode: input.mode,
    namespace: `${input.lane}:${input.mode}`,
  };
  return createMeshControlPlan({
    tenantId: input.tenantId,
    manifestHint,
    commands: [...input.commands],
    lanes: input.weights.map((entry) => ({ lane: entry.lane, weight: entry.weight })),
    metadata: {
      tags: normalizeConfigTags(input.tags),
      commandCount: input.commands.length,
    },
  });
};

type ChainResult<TValue = unknown> = {
  readonly ok: boolean;
  readonly value?: TValue;
  readonly errors?: readonly string[];
};

const buildTimeline = (
  seedLane: MeshLane,
  policies: readonly string[],
  score: number,
): readonly MeshControlPlaneTimelineEntry[] =>
  [...defaultPolicyTimeline(policies), { tick: policies.length + 1, lane: seedLane, score }];

const buildSummary = (runId: ControlPlaneRunId, events: readonly MeshRuntimeEvent[]): MeshControlPlaneTimelineInput => {
  const summary = summarizeControlSeries({ runId, seedLane: 'signal', events });
  return {
    runId,
    score: summary.score,
    confidence: summary.confidence,
    fingerprint: summary.fingerprint,
    policies: summary.policies,
    timeline: buildTimeline('signal', summary.policies, summary.score),
  };
};

const asOutput = (value: unknown): ChainResult['value'] => (value as ChainResult['value']) ?? {};

export const executeControlPlan = async <TChain extends readonly PluginDefinition[]>(
  tenantId: string,
  chain: CompatibleChain<TChain> & readonly PluginDefinition[],
  seed: MeshRunSeed,
  config: ControlPlaneConfig,
  planInput: {
    readonly commands: readonly ControlPlaneCommand[];
    readonly weights: readonly MeshControlPlaneLaneWeights[];
  },
): Promise<{ readonly ok: boolean; readonly result?: MeshControlPlaneResult; readonly reason?: string }> => {
  if (!isControlEnabled(config)) {
    return { ok: false, reason: 'control plane disabled by config' };
  }

  const runId = toControlRunId(tenantId, seed.lane, seed.mode);
  const namespace = canonicalizeNamespace(`mesh-control:${tenantId}:${seed.lane}`);
  const session: SessionState = {
    runId,
    sessionId: createControlSession(tenantId, 'default'),
    tenantId: tenantId as ControlPlaneTenantId,
    lane: seed.lane,
    mode: seed.mode,
    startedAt: new Date().toISOString(),
  };

  const plan = toPlan({
    tenantId,
    lane: seed.lane,
    mode: seed.mode,
    commands: planInput.commands,
    weights: planInput.weights,
    tags: [seed.lane, seed.mode, runId],
  });
  const tasks = normalizePlan(compileExecutionPlan(plan.commands));
  const signature = buildControlSignature(config);
  const manifest = resolveManifestForLane(seed);
  const registry = new MeshControlRegistry({
    namespace,
    enabled: true,
    mode: 'live',
  });

  const pluginIds: readonly PluginId[] = collectIterable(toIterableIterator(chain)).map((entry) => entry.id as PluginId);
  registry.register({
    runId,
    tenantId: tenantId as ControlPlaneTenantId,
    lane: seed.lane,
    startedAt: session.startedAt,
    plugins: pluginIds,
    metrics: new Map([
      ['signature-length', signature.length],
      ['plugin-count', pluginIds.length],
    ]),
  });

  const envelope = buildMeshEnvelope(seed);
  const context = buildMeshContext(seed, z.record(z.unknown()));

  const snapshots: Array<ControlPlaneSnapshot<MeshControlPlaneExecutionOutput>> = [];
  const stack = new AsyncDisposableStack();
  try {
    await using _scope = new PluginSession(pluginSessionConfigFrom(seed.tenantId, namespace, session.sessionId));
    stack.defer(() => undefined);

    let step = 0;
    for (const task of tasks) {
      const stage = task.command.command.split(':')[1] as CommandStage<ControlPlaneCommand>;
      const commandPayload: ChainInput = {
        runId,
        sessionId: session.sessionId,
        step,
        route: envelope.route,
        manifest: manifest.namespace,
        command: task.command.command,
        phase: stage,
        ...task.command.payload,
      };

      const chainResult = (await executePluginChain(chain, context, commandPayload)) as ChainResult<unknown>;

      snapshots.push({
        runId,
        tenantId,
        lane: seed.lane,
        mode: seed.mode as ControlPlaneMode,
        score: Number((task.weight + step / Math.max(1, tasks.length)).toFixed(6)),
        confidence: Number(((step + 1) / Math.max(1, tasks.length)).toFixed(6)),
        events: [buildStageEvent(runId, stage), emitEvent('mesh.control.command', task.weight, [task.command.command])],
        payload: {
          payload: {
            output: asOutput(chainResult.value),
            command: task.command,
            step,
            ok: chainResult.ok ?? true,
            stage,
            commandFingerprint: buildMeshFingerprint([task.command.command, runId]),
          },
          score: step / Math.max(1, tasks.length),
          summary: `phase:${stage}`,
          policies: rankPoliciesByWeight([{
            name: task.command.command,
            weight: task.weight,
          }]),
          timeline: [
            {
              tick: step,
              lane: seed.lane,
              score: task.weight,
            },
          ],
        },
      });
      step += 1;
    }
  } finally {
    await stack.disposeAsync();
  }

  const events = aggregateEventSeries(snapshots.flatMap((entry) => entry.events));
  const snapshot = snapshots.at(-1) ?? {
    runId,
    tenantId: tenantId as ControlPlaneTenantId,
    lane: seed.lane,
    mode: seed.mode as ControlPlaneMode,
    score: 0,
    confidence: 0,
    events: [emitEvent('mesh.control.empty', 0, [tenantId])],
    payload: {
      payload: { output: undefined },
    },
  };
  const summary = buildSummary(runId, events);

  return {
    ok: true,
    result: {
      ok: snapshots.length > 0,
      snapshot: {
        ...snapshot,
        payload: {
          ...snapshot.payload,
          policies: summary.policies,
          timeline: summary.timeline,
          score: summary.score,
          fingerprint: summary.fingerprint,
          summary: buildEventFingerprint(events),
        },
      },
      metadata: {
        manifest,
        stage: tasks.length,
        manifestSource: envelope.route,
        context: {
          commandCount: tasks.length,
          sessionId: session.sessionId,
          timelineLength: summary.timeline.length,
        },
        runtimeFingerprint: buildMeshFingerprint([runId, signature, tenantId]) as any,
      },
      command: {
        command: 'cp:close',
        payload: {
          phase: 'close',
          plan: plan.lanes[0]?.lane ?? seed.lane,
          timestamp: new Date().toISOString(),
        },
      },
      telemetry: [...events, ...registry.toEventStream()],
    },
  };
};

export const commandLaneFromResult = <TResult extends MeshControlPlaneResult>(result: TResult): MeshControlPlaneLanePlan['lane'] =>
  result.snapshot.lane === 'policy' ? 'policy' : 'signal';

export const buildMeshRunFromState = (state: SessionState): {
  readonly plan: MeshControlPlaneExecutionPlan;
  readonly configId: string;
  readonly stream: readonly string[];
} => ({
  plan: toPlan({
    tenantId: state.tenantId,
    lane: state.lane,
    mode: state.mode,
    commands: [
      { command: 'cp:start', payload: { phase: 'bootstrap' } },
      { command: 'cp:close', payload: { phase: 'finalize' } },
    ],
    weights: [
      { lane: state.lane, weight: 1 },
      { lane: 'safety', weight: 1 },
    ],
    tags: ['bootstrap'],
  }),
  configId: buildMeshFingerprint([state.runId, state.sessionId, state.lane]),
  stream: [state.runId, state.sessionId, state.startedAt],
});
