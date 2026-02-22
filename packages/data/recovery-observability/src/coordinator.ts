import type { RecoveryArtifactRepository, RecoveryArtifactFilter } from '@data/recovery-artifacts';
import { buildDigestForFilter } from './metrics';
import type { RecoveryObservabilitySnapshot } from './types';

export interface RecoveryObservabilityCoordinator {
  refresh(filter: RecoveryArtifactFilter): Promise<RecoveryObservabilitySnapshot>;
}

export class RecoveryObservabilityCoordinatorImpl implements RecoveryObservabilityCoordinator {
  constructor(
    private readonly artifactRepository: RecoveryArtifactRepository,
  ) {}

  async refresh(filter: RecoveryArtifactFilter): Promise<RecoveryObservabilitySnapshot> {
    const records = await this.artifactRepository.queryArtifacts(filter);
    return buildDigestForFilter(records, filter);
  }
}
