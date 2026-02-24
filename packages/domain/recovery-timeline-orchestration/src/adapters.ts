import { iter } from '@shared/timeline-orchestration-runtime';
import { type RecoveryTimeline } from '@domain/recovery-timeline';
import {
  buildConductorOutput,
  evaluateTimelineWindow,
  buildForecastWindow,
} from './forecast';
import {
  ConductorInputSchema,
  type ConductorInput,
  type ConductorInputPayload,
  type ConductorMode,
  type ConductorOutput,
  type ConductorPolicy,
  type ConductorResult,
} from './types';
import {
  getTimeline,
  listTimelines,
  resolveProfileEntries,
  resolveSessionId,
  conductorPluginCatalog,
} from './fixtures';

export interface ConductorServiceOptions {
  readonly mode: ConductorMode;
  readonly windowMinutes: number;
  readonly pluginNames: readonly string[];
  readonly policy: ConductorPolicy<'adaptive'>;
}

export interface TimelineConductorSession {
  readonly sessionId: string;
  readonly options: ConductorServiceOptions;
  readonly startedAt: Date;
}

export interface ConductorRunResult {
  readonly session: TimelineConductorSession;
  readonly output: ConductorOutput;
  readonly trend: readonly number[];
  readonly forecastCount: number;
}

export function normalizeInput(raw: ConductorInputPayload): ConductorInput {
  const parsed = ConductorInputSchema.parse(raw);
  return {
    seedTimeline: getTimeline(parsed.timelineId) as RecoveryTimeline,
    mode: parsed.mode,
    plugins: parsed.pluginNames,
    pluginNames: parsed.pluginNames,
    windowMinutes: parsed.windowMinutes,
    profile: parsed.profile,
  };
}

export async function availableConductorTimelines(mode: ConductorMode): Promise<readonly string[]> {
  const profile = await resolveProfileEntries(mode);
  const enabled = profile.filter((entry) => entry.enabled).map((entry) => entry.namespace);
  const fromPlugins = conductorPluginCatalog
    .filter((entry) => entry.phase === mode || entry.phase === 'simulate')
    .map((entry) => entry.pluginId);

  return enabled
    .concat(fromPlugins)
    .filter((value, index, all) => all.indexOf(value) === index);
}

export async function createConductorSession(
  input: ConductorInput,
  mode: ConductorMode,
): Promise<TimelineConductorSession> {
  const profileEntries = await resolveProfileEntries(mode);
  const score = evaluateTimelineWindow(input);
  const sessionId = resolveSessionId(mode);

  return {
    sessionId,
    options: {
      mode,
      windowMinutes: Math.max(5, input.windowMinutes),
      pluginNames: profileEntries.map((entry) => entry.id),
      policy: {
        profile: 'adaptive',
        minConfidence: Math.min(0.95, score / 1000),
        sampleWindow: Math.max(1, input.windowMinutes),
        allowPartial: true,
      },
    },
    startedAt: new Date(),
  };
}

export async function runTimelineConductor(
  input: ConductorInput,
  policy: ConductorPolicy<'adaptive'>,
): Promise<ConductorResult<ConductorRunResult>> {
  try {
    const session = await createConductorSession(input, input.mode);
    const output = buildConductorOutput(input, input.seedTimeline, policy);
    if (!output.ok) {
      return output;
    }

    const timelineEvents = input.seedTimeline.events;
    const trend = iter(timelineEvents)
      .map((event) => event.riskScore)
      .reduce<number[]>([], (acc, score) => {
        acc.push(score);
        return acc;
      });

    const finalTrend = trend.length === 0 ? [0] : trend;

    const forecast = buildForecastWindow(input.seedTimeline, input.mode, {
      profile: 'adaptive',
      minConfidence: policy.minConfidence,
      sampleWindow: policy.sampleWindow,
      allowPartial: policy.allowPartial,
    });

    return {
      ok: true,
      output: {
        session,
        output: output.output,
        trend: finalTrend,
        forecastCount: forecast.samples.length,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error('unexpected conductor failure'),
    };
  }
}

export function listCandidateTimelines(team = 'Ops Team'): RecoveryTimeline[] {
  return listTimelines({ ownerTeam: team, includeSegments: true }).slice(0, 8);
}

export function hasSimulationData(input: ConductorInput): boolean {
  return input.seedTimeline.segments.length > 0;
}
