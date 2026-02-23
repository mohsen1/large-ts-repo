import { TenantId, RecoverySignal, SeverityBand, CommandRunbook } from './models';

export type WorkflowState = 'idle' | 'drafting' | 'simulating' | 'validated' | 'published';

export interface WorkflowCheckpoint {
  readonly at: string;
  readonly state: WorkflowState;
  readonly message: string;
  readonly runbookCount: number;
  readonly signalCount: number;
}

export interface ScenarioWorkflowInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly requestedBy: string;
}

export interface ScenarioWorkflowOutput {
  readonly tenantId: TenantId;
  readonly runbookCount: number;
  readonly signalCount: number;
  readonly state: WorkflowState;
  readonly checkpoints: ReadonlyArray<WorkflowCheckpoint>;
  readonly blockers: ReadonlyArray<string>;
}

const now = (): string => new Date().toISOString();

const validateRunbooks = (runbooks: readonly CommandRunbook[]): ReadonlyArray<string> => {
  const messages: string[] = [];
  if (runbooks.length === 0) {
    messages.push('No runbooks configured');
    return messages;
  }

  for (const runbook of runbooks) {
    if (!runbook.steps.length) messages.push(`Runbook ${runbook.name} has no steps`);
    if (!runbook.name.trim()) messages.push(`Runbook ${runbook.id} missing name`);
  }

  return messages;
};

const validateSignals = (signals: readonly RecoverySignal[]): ReadonlyArray<string> => {
  if (signals.length === 0) return ['No signals received'];
  const blockers = new Set<string>();

  for (const signal of signals) {
    if (!signal.class) blockers.add(`signal ${signal.id} missing class`);
    if (!signal.title.trim()) blockers.add(`signal ${signal.id} missing title`);
  }
  return [...blockers];
};

const signalBandShift = (band: SeverityBand): SeverityBand => {
  if (band === 'low') return 'medium';
  if (band === 'medium') return 'high';
  return band;
};

const checkpoint = (state: WorkflowState, input: ScenarioWorkflowInput, runbookCount: number, signalCount: number, message: string): WorkflowCheckpoint => ({
  at: now(),
  state,
  message,
  runbookCount,
  signalCount,
});

const buildBlockers = (runbookIssues: ReadonlyArray<string>, signalIssues: ReadonlyArray<string>): ReadonlyArray<string> => {
  const unique = new Set<string>([...runbookIssues, ...signalIssues]);
  return [...unique];
};

export const buildScenarioWorkflow = (input: ScenarioWorkflowInput): ScenarioWorkflowOutput => {
  const runbookIssues = validateRunbooks(input.runbooks);
  const signalIssues = validateSignals(input.signals);
  const blockers = buildBlockers(runbookIssues, signalIssues);

  const draftState: WorkflowState = blockers.length > 0 ? 'drafting' : 'simulating';
  const validatedState: WorkflowState = blockers.length > 0 ? 'drafting' : 'validated';
  const finalState: WorkflowState = validatedState === 'validated' ? 'published' : 'idle';

  const checkpoints: WorkflowCheckpoint[] = [];
  checkpoints.push(
    checkpoint('idle', input, input.runbooks.length, input.signals.length, `workflow initialized by ${input.requestedBy}`),
  );
  checkpoints.push(
    checkpoint('drafting', input, input.runbooks.length, input.signals.length, `Draft created with ${input.runbooks.length} runbooks`),
  );
  if (signalIssues.length === 0) {
    checkpoints.push(checkpoint('simulating', input, input.runbooks.length, input.signals.length, 'Signal quality acceptable for simulation'));
  }
  if (runbookIssues.length === 0 && signalIssues.length === 0) {
    checkpoints.push(checkpoint(validatedState, input, input.runbooks.length, input.signals.length, 'Validation complete'));
    checkpoints.push(checkpoint(finalState, input, input.runbooks.length, input.signals.length, `Band advanced to ${signalBandShift(input.band)}`));
  }

  return {
    tenantId: input.tenantId,
    runbookCount: input.runbooks.length,
    signalCount: input.signals.length,
    state: finalState,
    checkpoints,
    blockers,
  };
};

export interface WorkflowTransition {
  readonly tenantId: TenantId;
  readonly from: WorkflowState;
  readonly to: WorkflowState;
  readonly at: string;
  readonly reasons: ReadonlyArray<string>;
}

export const transitionWorkflow = (from: WorkflowState, to: WorkflowState, reasons: ReadonlyArray<string>): WorkflowTransition => ({
  tenantId: 'tenant-main' as TenantId,
  from,
  to,
  at: now(),
  reasons,
});

