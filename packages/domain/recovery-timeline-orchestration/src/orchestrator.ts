import {
  TimelineRuntime,
  runRuntime,
  type PluginId,
  type RuntimeExecutionPlan,
  type RuntimeExecutionOptions,
} from '@shared/timeline-orchestration-runtime';
import { type RecoveryTimelineEvent, type RecoveryTimelineSegment } from '@domain/recovery-timeline';
import {
  createConductorId,
  type ConductorInput,
  type ConductorMode,
  type ConductorOutput,
  type ConductorPolicy,
  type ConductorResult,
} from './types';
import { buildConductorOutput } from './forecast';
import { analyzePlan } from './pipeline';
import { conductorPluginCatalog, resolveProfileEntries } from './fixtures';
import { listCandidateTimelines } from './adapters';
import { type PluginInput } from '@shared/timeline-orchestration-runtime';

interface RuntimeChainInput {
  readonly timelineId: string;
  readonly events: RecoveryTimelineEvent[];
  readonly segments: RecoveryTimelineSegment[];
  readonly samples: unknown[];
}

const toOptions = (mode: ConductorMode, profile: string): RuntimeExecutionOptions => ({
  namespace: `timeline-conductor:${mode}`,
  mode: profile === 'adaptive' ? 'parallel' : 'serial',
  strict: profile === 'predictive',
});

function pluginPlan(): RuntimeExecutionPlan<RuntimeChainInput> {
  return {
    namespace: `runtime:conductor`,
    plugins: conductorPluginCatalog
      .map((entry) => ({
        id: `timeline-plugin/${entry.pluginId.split('/')[1] ?? 'plugin'}` as unknown as PluginId<string>,
        name: entry.pluginId.split('/')[1] ?? 'plugin',
        supports: ['simulate', 'validate'],
        dependsOn: [],
        version: '1.0.0',
        canHandle(input: PluginInput<RuntimeChainInput>): input is PluginInput<RuntimeChainInput> {
          return input.payload.timelineId.length > 0;
        },
        process: async (input) => ({
          status: 'ok',
          output: input,
          message: entry.pluginId,
          details: {
            phase: entry.phase,
          },
        }),
      })),
  };
}

export async function runConductorOrchestration(
  input: ConductorInput,
  policy: ConductorPolicy<'adaptive'>,
): Promise<ConductorResult<ConductorOutput>> {
  const chainResult = await analyzePlan(input.seedTimeline);
  void chainResult;

  const runtimeInput: RuntimeChainInput = {
    timelineId: input.seedTimeline.id,
    events: [...input.seedTimeline.events],
    segments: [...input.seedTimeline.segments],
    samples: [],
  };

  const profileEntries = await resolveProfileEntries(input.mode);
  const options = toOptions(input.mode, profileEntries.at(0)?.mode ?? 'predictive');

  const runtime = new TimelineRuntime<RuntimeChainInput, unknown>(pluginPlan());
  const runtimeResult = await runtime.execute(runtimeInput, options);

  if (runtimeResult.status === 'error') {
    return {
      ok: false,
      error: new Error(runtimeResult.message ?? 'runtime failed'),
    };
  }

  const output = buildConductorOutput(input, input.seedTimeline, policy);
  if (!output.ok) {
    return output;
  }

  const timelineCandidates = listCandidateTimelines('Ops Team');
  return {
    ok: true,
    output: {
      ...output.output,
      nextSteps: [...output.output.nextSteps, ...timelineCandidates.map((candidate) => `candidate:${candidate.id}`)],
      id: createConductorId(input.mode),
    },
  };
}

export async function previewConductor(input: ConductorInput): Promise<ConductorResult<ConductorOutput>> {
  const policy = {
    profile: 'predictive' as const,
    minConfidence: 0.62,
    sampleWindow: 30,
    allowPartial: true,
  };

  const result = await runRuntime<ConductorInput, { orderedMessages?: string[]; messages?: string[] }>(
    {
      namespace: `preview:${input.mode}`,
      plugins: [],
    },
    input,
    {
      namespace: `preview:${input.mode}`,
      mode: 'parallel',
      strict: false,
    },
  );

  if (result.status === 'ok') {
    return {
      ok: true,
      output: {
        id: createConductorId(input.mode),
        timelineId: input.seedTimeline.id,
        mode: input.mode,
        riskProfile: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
        timelineWindow: [],
        nextSteps: [...(result.output.orderedMessages ?? ['preview'])],
        snapshot: {
          timelineId: input.seedTimeline.id,
          source: 'preview',
          measuredAt: new Date(),
          confidence: 0.88,
          expectedReadyAt: new Date(),
          actualReadyAt: undefined,
          note: result.runtimeTrace.invocationId,
        },
      },
    };
  }

  return { ok: false, error: new Error('preview failed') };
}
