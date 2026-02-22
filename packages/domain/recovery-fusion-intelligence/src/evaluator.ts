import { fail, ok, type Result } from '@shared/result';
import type { FusionSignal, FusionWave, FusionWaveId, FusionReadinessState, FusionBundle, FusionEvaluation, FusionTopology } from './types';
import { analyzeTopology, buildDependencyOrder, normalizeTopology } from './topology';
import { calculateRiskVector, normalizeSignalWeight, rankSignals } from './planner';

const normalizeCommandCount = (count: number): number => {
  if (!Number.isFinite(count)) return 0;
  return Math.min(1, Math.max(0, count / 20));
};

const readinessToNumeric = (state: FusionReadinessState): number => {
  switch (state) {
    case 'stable':
      return 1;
    case 'running':
      return 0.8;
    case 'warming':
      return 0.6;
    case 'degraded':
      return 0.45;
    case 'blocked':
      return 0.2;
    case 'idle':
      return 0.5;
    default:
      return 0;
  }
};

const commandPriority = (wave: FusionWave): number => {
  const readiness = readinessToNumeric(wave.state);
  const risk = normalizeSignalWeight(wave.riskBand === 'critical' ? 1 : wave.riskBand === 'red' ? 0.8 : 0.4);
  const signalWeight = normalizeSignalWeight(wave.readinessSignals.length / 10);
  return (readiness * 0.4) + (1 - risk) * 0.4 + signalWeight * 0.2;
};

const scoreWave = (wave: FusionWave): number => {
  const commandPressure = normalizeCommandCount(wave.commands.length);
  const start = new Date(wave.windowStart).valueOf();
  const end = new Date(wave.windowEnd).valueOf();
  const validWindow = Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, (end - start) / (60_000)) : 1;
  const timeHealth = Math.max(0, Math.min(1, 1 - (validWindow - 1) / 120));
  return Math.max(0, Math.min(1, commandPriority(wave) * 0.7 + commandPressure * 0.2 + timeHealth * 0.1));
};

const summarizeSignals = (signals: readonly FusionSignal[]): string => {
  return signals
    .slice(0, 3)
    .map((signal) => signal.source)
    .filter(Boolean)
    .sort()
    .join(',');
};

const buildSuggestedCommands = (wave: FusionWave, topology: FusionTopology): readonly FusionWave['commands'][number][] => {
  const dependencyOrder = buildDependencyOrder(topology);
  if (dependencyOrder.length === 0 || wave.commands.length === 0) {
    return [];
  }

  const action: FusionWave['commands'][number]['action'] = wave.state === 'running' ? 'verify' : wave.state === 'blocked' ? 'resume' : 'start';
  return wave.commands.map((command, index) => ({
    ...command,
    action: index % 2 === 0 ? action : command.action,
  }));
};

export const evaluateWave = (
  wave: FusionWave,
  bundle: FusionBundle,
  topology: FusionTopology,
): Result<FusionEvaluation, Error> => {
  if (wave.commands.length === 0) {
    return fail(new Error(`no commands in wave ${wave.id}`));
  }

  const normalized = normalizeTopology(topology);
  const metrics = analyzeTopology(normalized);
  const score = scoreWave(wave);
  const signalScore = rankSignals(wave.readinessSignals);
  const riskVector = calculateRiskVector(wave.readinessSignals, metrics.density);
  const readinessDelta = Math.max(0, Math.min(1, signalScore - riskVector.riskIndex));

  const _summary = summarizeSignals(wave.readinessSignals);

  return ok({
    bundleId: bundle.id,
    score: Math.max(0, Math.min(1, (score + readinessDelta) / 2)),
    severity: riskVector.severity,
    confidence: riskVector.confidence,
    readinessDelta,
    signals: wave.readinessSignals,
    recommended: buildSuggestedCommands(wave, normalized),
  });
};

export const evaluateBundle = (
  bundle: FusionBundle,
  topology: FusionTopology,
): Result<{
  readonly bundleId: string;
  readonly averageScore: number;
  readonly totalCommands: number;
  readonly topWave: FusionWaveId | undefined;
  readonly risks: readonly string[];
  readonly evaluation: readonly FusionEvaluation[];
}, Error> => {
  const waves = [...bundle.waves].sort((a, b) => scoreWave(b) - scoreWave(a));

  if (waves.length === 0) {
    return fail(new Error(`empty bundle ${bundle.id}`));
  }

  const evaluations: FusionEvaluation[] = [];
  const risks: string[] = [];

  for (const wave of waves) {
    const evaluated = evaluateWave(wave, bundle, topology);
    if (!evaluated.ok) {
      risks.push(`wave:${wave.id}`);
      continue;
    }
    evaluations.push(evaluated.value);
    if (evaluated.value.score < 0.35) {
      risks.push(`low-score:${wave.id}:${evaluated.value.score.toFixed(2)}`);
    }
  }

  const totalCommands = waves.reduce((total, wave) => total + wave.commands.length, 0);
  const averageScore = evaluations.length
    ? evaluations.reduce((sum, value) => sum + value.score, 0) / evaluations.length
    : 0;

  return ok({
    bundleId: bundle.id,
    averageScore,
    totalCommands,
    topWave: waves[0]?.id,
    risks,
    evaluation: evaluations,
  });
};

export const validateWaveStateTransition = (from: FusionReadinessState, to: FusionReadinessState): boolean => {
  if (from === to) {
    return true;
  }
  if (from === 'failed' && to !== 'idle') {
    return false;
  }
  if (from === 'blocked' && to === 'running') {
    return false;
  }

  return true;
};
