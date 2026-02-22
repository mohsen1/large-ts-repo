import type { RecoveryDrillRunSummary } from '@domain/recovery-drill-telemetry';
import { Drift, fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

export interface NullDrillRepository {
  archive(summary: RecoveryDrillRunSummary): Promise<Result<void, Error>>;
}

export class NullDrillArchiveAdapter implements NullDrillRepository {
  async archive(summary: RecoveryDrillRunSummary): Promise<Result<void, Error>> {
    return ok(undefined);
  }
}
