import type { DiagnosticRecord, RuntimeDiagnostics } from '@shared/recovery-orchestration-lab-runtime';
import { createDiagnostics, summarizeDiagnostics } from '@shared/recovery-orchestration-lab-runtime';
import type { RunId } from '@shared/recovery-orchestration-lab-runtime';
import type { RuntimeTopology } from '@shared/recovery-orchestration-lab-runtime';

export interface TelemetryCapture {
  readonly runId: RunId;
  readonly diagnostics: readonly DiagnosticRecord[];
  readonly summary: { readonly min: number; readonly max: number; readonly average: number };
}

export const captureTelemetry = (runId: RunId, topology: RuntimeTopology): TelemetryCapture => {
  const diagnostics: RuntimeDiagnostics = createDiagnostics(runId, topology);
  const summary = summarizeDiagnostics(diagnostics.records);

  return {
    runId: diagnostics.runId as RunId,
    diagnostics: diagnostics.records,
    summary,
  };
};

export const telemetrySignal = (capture: TelemetryCapture): string =>
  `${capture.runId}:${capture.summary.min.toFixed(2)}/${capture.summary.max.toFixed(2)}`;
