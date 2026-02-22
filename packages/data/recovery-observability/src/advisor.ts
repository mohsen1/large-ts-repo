import type { RecoveryRunDigest, RecoverySuggestion } from './types';
import type { RecoveryArtifactRepository } from '@data/recovery-artifacts';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import { digestFromArtifact } from './types';

export interface AdviceResult {
  readonly runId: RecoveryRunState['runId'];
  readonly action: 'continue' | 'pause' | 'escalate' | 'halt';
}

export const suggestAction = (digest: RecoveryRunDigest): AdviceResult => {
  if (digest.health === 'steady' && digest.score >= 90) return { runId: digest.runId, action: 'continue' };
  if (digest.health === 'degraded' && digest.score >= 70) return { runId: digest.runId, action: 'continue' };
  if (digest.health === 'critical' && digest.score >= 40) return { runId: digest.runId, action: 'pause' };
  if (digest.status === 'running') return { runId: digest.runId, action: 'escalate' };
  return { runId: digest.runId, action: 'halt' };
};

export const buildSuggestion = (digest: RecoveryRunDigest): RecoverySuggestion => ({
  runId: digest.runId,
  severity: digest.health,
  reason: `signal=${digest.health}, score=${digest.score}`,
  actions: [
    `recommended=${suggestAction(digest).action}`,
    'run dependency audit',
    'notify primary on-call',
  ],
  confidence: Math.round(digest.score * 0.8 + (suggestAction(digest).action === 'halt' ? 15 : 5)),
});

export class RecoveryAdvisor {
  constructor(private readonly artifactRepository: RecoveryArtifactRepository) {}

  async latestSuggestion(): Promise<readonly RecoverySuggestion[]> {
    const artifacts = await this.artifactRepository.queryArtifacts({});
    const latestByRun = new Map<string, ReturnType<typeof digestFromArtifact>>();
    const latestArtifactByRun = new Map<string, string>();
    for (const artifact of artifacts) {
      const digest = digestFromArtifact(artifact);
      const current = latestByRun.get(digest.runId);
      const currentTs = latestArtifactByRun.get(digest.runId);
      if (!current || !currentTs || new Date(currentTs).getTime() < Date.parse(artifact.recordedAt)) {
        latestByRun.set(digest.runId, digest);
        latestArtifactByRun.set(digest.runId, artifact.recordedAt);
      }
    }
    return Array.from(latestByRun.values()).map(buildSuggestion);
  }
}
