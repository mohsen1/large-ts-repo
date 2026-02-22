import type { RecoveryArtifact, RecoveryArtifactFilter } from '@data/recovery-artifacts';
import type { HealthSignal, RecoveryObservabilitySnapshot, RecoveryRunDigest, RecoveryFleetDigest } from './types';
import { digestFromArtifact, inferHealthSignal } from './types';

const pickSignalWeight = (signal: HealthSignal): number => {
  switch (signal) {
    case 'steady':
      return 3;
    case 'degraded':
      return 2;
    case 'critical':
      return 1;
    case 'terminal':
      return 0;
    default:
      return 1;
  }
};

const scoreForArtifacts = (artifacts: readonly RecoveryArtifact[]) =>
  artifacts.reduce((acc, artifact) => {
    const digest = digestFromArtifact(artifact);
    return acc + digest.score * pickSignalWeight(digest.health);
  }, 0);

export const buildDigestForFilter = (
  artifacts: readonly RecoveryArtifact[],
  filter?: RecoveryArtifactFilter,
): RecoveryObservabilitySnapshot => {
  const filtered = artifacts.filter((artifact) => {
    if (filter?.runId && artifact.runId !== filter.runId) return false;
    if (filter?.tenant && artifact.program.tenant !== filter.tenant) return false;
    return true;
  });

  const records = filtered.map(digestFromArtifact);
  const grouped = new Map<string, RecoveryArtifact[]>();
  for (const artifact of filtered) {
    const key = `${artifact.program.tenant}:${artifact.program.service}`;
    const next = grouped.get(key) ?? [];
    next.push(artifact);
    grouped.set(key, next);
  }

  const fleets: RecoveryFleetDigest[] = [];
  const suggestions = [];
  for (const [key, values] of grouped.entries()) {
    const [tenant, service] = key.split(':');
    const avgScore = values.length ? scoreForArtifacts(values) / values.length : 0;
    const terminalCount = values.filter(
      (artifact) => inferHealthSignal(digestFromArtifact(artifact).score) === 'terminal',
    ).length;
    const terminalRate = values.length ? terminalCount / values.length : 0;
    const pulse = terminalRate > 0.4 ? 'degrading' : terminalRate > 0.15 ? 'stable' : 'improving';
    fleets.push({
      tenant,
      service,
      runCount: values.length,
      avgScore,
      terminalRate,
      pulse,
    });

    if (terminalRate > 0.35) {
      suggestions.push({
        runId: values[0]!.runId,
        severity: 'critical',
        reason: `${tenant}:${service} has a high terminal trend`,
        actions: [
          'Throttle concurrent step executions',
          'Escalate to incident channel',
          'Reduce fallback fanout for the next cycle',
        ],
        confidence: Math.round(70 + Math.min(20, values.length)),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    records,
    fleets,
    suggestions,
  };
};
