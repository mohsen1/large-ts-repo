import { type NoInfer } from '@shared/type-level';
import {
  type TenantId,
  type RecoverySignal,
  type RecoverySimulationResult,
  type StageAttempt,
  type StageAttemptId,
  createStageAttemptId,
  createSignalId,
  type RecoverySignalId,
  type StressPhase,
  type StageSignal,
} from './models';

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? { ...(value as Record<string, unknown>) } : { value };

export type NoteSeverity = 'trace' | 'info' | 'warn' | 'error';
export type NoteOrigin = `${string}:${string}`;

export interface RuntimeNote {
  readonly tenantId: TenantId;
  readonly at: string;
  readonly phase: StressPhase;
  readonly severity: NoteSeverity;
  readonly origin: NoteOrigin;
  readonly message: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RuntimeNotesEnvelope {
  readonly tenantId: TenantId;
  readonly notes: readonly RuntimeNote[];
  readonly summary: string;
  readonly severity: NoteSeverity;
}

const severityRank: Record<NoteSeverity, number> = {
  trace: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const formatOrigin = (tenantId: TenantId, phase: StressPhase): NoteOrigin => `${tenantId}:${phase}` as NoteOrigin;

export const createRuntimeNote = <TPayload extends Readonly<Record<string, unknown>>>(
  tenantId: TenantId,
  phase: StressPhase,
  severity: NoteSeverity,
  payload: NoInfer<TPayload>,
  message: string,
): RuntimeNote => ({
  tenantId,
  at: new Date().toISOString(),
  phase,
  severity,
  origin: formatOrigin(tenantId, phase),
  message,
  payload: payload as Readonly<Record<string, unknown>>,
});

export const createFailure = (
  tenantId: TenantId,
  phase: StressPhase,
  error: unknown,
  details: ReadonlyArray<RuntimeNote> = [],
): RuntimeNote => {
  return createRuntimeNote(tenantId, phase, 'error', {
    details,
    error: typeof error === 'string' ? error : 'unknown',
  }, 'runtime failure');
};

export const consolidateNotes = <TNotes extends readonly RuntimeNote[]>(
  tenantId: TenantId,
  notes: NoInfer<TNotes>,
): RuntimeNotesEnvelope => {
  const summary = notes
    .map((note) => `[${note.severity}]${note.phase}:${note.message}`)
    .join(' | ');

  const severity = notes.reduce<NoteSeverity>((current, note) => {
    if (severityRank[note.severity] > severityRank[current]) {
      return note.severity;
    }
    return current;
  }, 'trace');

  return {
    tenantId,
    notes,
    summary: summary || 'no notes',
    severity,
  };
};

export const buildSignalEnvelope = <TSignals extends readonly RecoverySignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): readonly RuntimeNote[] => {
  return signals.map((signal, index) =>
    createRuntimeNote(tenantId, 'observe', index % 2 === 0 ? 'info' : 'trace', asRecord(signal),
    `signal ${signal.id} class=${signal.class} severity=${signal.severity}`),
  );
};

export const buildAttemptNotes = (tenantId: TenantId, attempt: StageAttempt): readonly RuntimeNote[] => {
  const source = `${attempt.id}`;
  const id = createSignalId(source);
  const first = createRuntimeNote(
    tenantId,
    'verify',
    attempt.normalizedScore > 0.5 ? 'info' : 'warn',
    asRecord({
      attemptId: id,
      attempt,
      source: attempt.source,
      score: attempt.normalizedScore,
    }),
    `attempt ${attempt.id} score ${attempt.normalizedScore}`,
  );
  const second = createRuntimeNote(tenantId, 'verify', 'trace', { index: attempt.severityBand }, 'verifying attempt phase');
  return [first, second];
};

export const buildStageNotes = <TSignals extends readonly StageSignal[]>(
  tenantId: TenantId,
  phase: StressPhase,
  signals: NoInfer<TSignals>,
): readonly RuntimeNote[] => {
  const start = createRuntimeNote(tenantId, phase, 'trace', { count: signals.length }, `starting ${phase}`);
  const ordered = signals.toSorted((left, right) => right.score - left.score);
  const notes = ordered.map((signal, index) =>
    createRuntimeNote(tenantId, phase, index % 5 === 0 ? 'warn' : 'info', asRecord(signal), `signal-id:${signal.signal}`),
  );
  return [start, ...notes];
};

export const summarizeSimulation = (result: RecoverySimulationResult): RuntimeNote[] => {
  return [
    createRuntimeNote(result.tenantId, 'verify', 'info', { riskScore: result.riskScore }, `riskScore=${result.riskScore}`),
    createRuntimeNote(result.tenantId, 'verify', 'trace', { sla: result.slaCompliance }, `sla=${result.slaCompliance}`),
  ];
};

class RuntimeNoteStream {
  readonly #tenantId: TenantId;
  readonly #notes: RuntimeNote[] = [];

  public constructor(tenantId: TenantId) {
    this.#tenantId = tenantId;
  }

  public write(note: RuntimeNote): void {
    this.#notes.push(note);
  }

  public writeAll(notes: readonly RuntimeNote[]): void {
    for (const note of notes) {
      this.write(note);
    }
  }

  public consume(): RuntimeNotesEnvelope {
    return consolidateNotes(this.#tenantId, [...this.#notes]);
  }

  public clear(): void {
    this.#notes.length = 0;
  }
}

export const createNoteStream = (tenantId: TenantId): RuntimeNoteStream => new RuntimeNoteStream(tenantId);

export const createAttemptLog = (
  tenantId: TenantId,
  source: RecoverySignalId,
  severity: NoteSeverity,
): StageAttemptId => createStageAttemptId(`${tenantId}:${source}:${severity}`);

export const withNoteStream = async <
  TInput,
  TOutput,
>(
  tenantId: TenantId,
  context: (stream: RuntimeNoteStream) => Promise<TOutput>,
): Promise<TOutput> => {
  const stream = createNoteStream(tenantId);
  const output = await context(stream);
  stream.writeAll([
    createRuntimeNote(tenantId, 'standdown', 'info', { output }, 'stream closed'),
  ]);
  return output;
};
