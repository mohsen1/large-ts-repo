import type { RuntimeRunRequest } from './orchestrator';
import type { DecisionStoreAdapter } from './store';
import { S3Client } from '@aws-sdk/client-s3';
import { executeRuntimeRun } from './orchestrator';

export interface LegacyRunnerDeps {
  store: DecisionStoreAdapter;
  s3Client: S3Client;
}

export async function runLegacyRuntime(request: RuntimeRunRequest, deps: LegacyRunnerDeps): Promise<string> {
  return executeRuntimeRun(request, deps);
}
