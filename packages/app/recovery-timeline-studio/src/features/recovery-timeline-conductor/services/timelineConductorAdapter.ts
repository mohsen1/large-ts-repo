import {
  runConductorOrchestration,
  runTimelineConductor,
  type ConductorInput,
  type ConductorPolicy,
  type ConductorResult,
} from '@domain/recovery-timeline-orchestration';
import {
  ConductorPolicySchema,
  type ConductorMode,
  type ConductorOutput,
  resolveProfileEntries,
} from '@domain/recovery-timeline-orchestration';
import { listTimelines, resolveRepository, seedRepository } from '../../../services/recoveryTimelineAdapter';

export interface CachedConductorState {
  timelineId: string;
  mode: ConductorMode;
  output?: ConductorOutput;
  trend: readonly number[];
  forecastCount: number;
}

const conductorCache = new Map<string, ConductorOutput | undefined>();

export async function preloadConductorCatalog(mode: ConductorMode): Promise<readonly string[]> {
  const profiles = await resolveProfileEntries(mode);
  return profiles.filter((entry) => entry.enabled).map((entry) => entry.namespace);
}

export async function runConductorPreview(input: ConductorInput): Promise<ConductorResult<{
  output: ConductorOutput;
  trend: readonly number[];
  forecastCount: number;
}>> {
  const policy: ConductorPolicy<'adaptive'> = {
    profile: 'adaptive',
    minConfidence: 0.8,
    sampleWindow: 20,
    allowPartial: true,
  };

  const result = await runConductorOrchestration(input, policy);

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    };
  }

  conductorCache.set(makeConductorCacheKey(input.mode, input.seedTimeline.id), result.output);
  return {
    ok: true,
    output: {
      output: result.output,
      trend: result.output.snapshot.note
        .split('|')
        .map((token) => token.length)
        .filter((value) => value > 0),
      forecastCount: result.output.nextSteps.length,
    },
  };
}

export async function executeConductorRun(input: ConductorInput): Promise<ConductorResult<{
  output: ConductorOutput;
  trend: readonly number[];
  forecastCount: number;
}>> {
  const policy: ConductorPolicy<'adaptive'> = {
    profile: 'adaptive',
    minConfidence: 0.72,
    sampleWindow: 45,
    allowPartial: true,
  };

  const orchestration = await runTimelineConductor(input, policy);
  if (!orchestration.ok) {
    return {
      ok: false,
      error: orchestration.error,
    };
  }

  const output = orchestration.output.output;
  const key = makeConductorCacheKey(input.mode, input.seedTimeline.id);
  conductorCache.set(key, output);

  return {
    ok: true,
    output: {
      output,
      trend: output.timelineWindow.map((step) => String(step).length),
      forecastCount: output.nextSteps.length,
    },
  };
}

export function getConductorCachedOutput(mode: ConductorMode, timelineId: string): ConductorOutput | undefined {
  return conductorCache.get(makeConductorCacheKey(mode, timelineId));
}

export function warmUpTimelines(): void {
  const timelines = listTimelines({ ownerTeam: 'Ops Team', includeSegments: true });
  seedRepository(timelines);
  resolveRepository();
}

function makeConductorCacheKey(mode: ConductorMode, timelineId: string): string {
  return `${mode}:${timelineId}`;
}
