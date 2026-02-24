import { useCallback, useMemo } from 'react';
import { z } from 'zod';
import type { MeshSignalKind, MeshPayloadFor, MeshRunArtifact } from '@service/recovery-ops-mesh-engine';

const signalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pulse'), payload: z.object({ value: z.number() }) }),
  z.object({ kind: z.literal('snapshot'), payload: z.object({ nodes: z.array(z.any()) }) }),
  z.object({ kind: z.literal('alert'), payload: z.object({ severity: z.string(), reason: z.string() }) }),
  z.object({ kind: z.literal('telemetry'), payload: z.record(z.number()) }),
]);

export interface MeshCommandDeckProps {
  readonly signal: MeshPayloadFor<MeshSignalKind>;
  readonly artifact: MeshRunArtifact | undefined;
  readonly disabled: boolean;
  readonly onRun: (value: MeshPayloadFor<MeshSignalKind>) => Promise<void>;
}

const isAlertPayload = (
  payload: MeshPayloadFor<MeshSignalKind>,
): payload is Extract<MeshPayloadFor<MeshSignalKind>, { kind: 'alert' }> => payload.kind === 'alert';

const priorityFromSignal = (signal: MeshPayloadFor<MeshSignalKind>): string =>
  signal.kind === 'alert' ? 'high' : signal.kind === 'snapshot' ? 'medium' : 'low';

export const MeshCommandDeck = ({ signal, artifact, disabled, onRun }: MeshCommandDeckProps) => {
  const parsed = signalSchema.safeParse(signal);
  const canRun = useMemo(() => artifact?.state !== 'executing', [artifact?.state]);
  const alertPayload = signal.kind === 'alert' &&
    typeof signal.payload === 'object' &&
    signal.payload !== null &&
    'severity' in signal.payload &&
    'reason' in signal.payload
    ? (signal.payload as { severity: string; reason: string })
    : undefined;

  const submit = useCallback(async () => {
    if (!parsed.success) return;
    await onRun(signal);
  }, [parsed.success, onRun, signal]);

  return (
    <section>
      <h3>Command Deck</h3>
      <p>Signal type: {signal.kind}</p>
      <p>Priority: {priorityFromSignal(signal)}</p>
      {alertPayload ? <p>Alert severity: {alertPayload.severity}</p> : null}
      <button
        type="button"
        disabled={disabled || !canRun || !parsed.success}
        onClick={submit}
      >
        Execute
      </button>
      <dl>
        <dt>State</dt>
        <dd>{artifact?.state ?? 'idle'}</dd>
        <dt>Emitted</dt>
        <dd>{artifact?.emitted ?? 0}</dd>
        <dt>Errors</dt>
        <dd>{artifact?.errors ?? 0}</dd>
      </dl>
    </section>
  );
};

export const MeshCommandHistory = ({
  artifacts,
}: {
  readonly artifacts: readonly {
    readonly id: string;
    readonly state: string;
    readonly startedAt: number;
    readonly emitted: number;
  }[];
}) => {
  const ordered = [...artifacts].sort((left, right) => right.startedAt - left.startedAt);
  return (
    <section>
      <h4>Run history</h4>
      <ul>
        {ordered.map((entry) => (
          <li key={entry.id}>
            {new Date(entry.startedAt).toLocaleTimeString()} — {entry.state} — emitted {entry.emitted}
          </li>
        ))}
      </ul>
    </section>
  );
};

export const MeshCommandSignals = ({
  signals,
}: {
  readonly signals: readonly MeshPayloadFor<MeshSignalKind>[];
}) => {
  return (
    <section>
      <h4>Signal batch ({signals.length})</h4>
      {signals.length === 0 ? <p>No signals</p> : null}
      {signals.length > 0 ? (
        <ul>
          {signals.map((signal, index) => (
            <li key={`${signal.kind}-${index}`}>
              {signal.kind}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
