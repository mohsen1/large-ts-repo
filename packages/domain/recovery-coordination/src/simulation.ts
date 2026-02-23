import type {
  CoordinationProgram,
  CoordinationConstraint,
  CoordinationSelectionResult,
  CoordinationPlanCandidate,
  CoordinationRunId,
  CoordinationTenant,
} from './types';
import { createPolicy, windowPolicyFromConstraints } from './policy';
import { constraintsProfile, summarizeByStep, summarizeProgramQuality, createQualityGate } from './quality';
import { buildWorkflowGraph, summarizeWorkflow, buildSignals } from './workflow';
import { asRun } from './schema';

export interface SimulationInput {
  readonly tenant: CoordinationTenant;
  readonly program: CoordinationProgram;
  readonly signalLimit: number;
  readonly maxCandidates: number;
}

export interface SimulationResult {
  readonly runId: CoordinationRunId;
  readonly tenant: CoordinationTenant;
  readonly candidateCount: number;
  readonly selected: CoordinationPlanCandidate | null;
  readonly summary: string;
  readonly diagnostics: readonly SimulationDiagnostic[];
  readonly projectedMinutes: number;
}

export interface SimulationDiagnostic {
  readonly code: string;
  readonly hint: string;
  readonly severity: 'info' | 'warn' | 'error';
}

export const simulateCoordinationRun = (input: SimulationInput): SimulationResult => {
  const profile = summarizeProgramQuality(input.program);
  const filteredConstraints = windowPolicyFromConstraints(input.program.constraints);
  const windowsCount = filteredConstraints.windows.length;
  const graph = buildWorkflowGraph(input.program);
  const signals = buildSignals(input.program);
  const windowSummary = summarizeWorkflow(input.program, input.program.constraints);
  const candidates = generateCandidateSeeds(input.program, input.signalLimit, input.maxCandidates);
  const baseline = createPolicy(input.tenant, `${input.program.id}:candidate`, input.program.constraints);

  const diagnostics = collectDiagnostics(input.program.constraints, graph, profile, windowsCount, baseline);
  const selected = selectFirstCandidate(candidates, input.program);
  const runId = asRun(`${input.tenant}:${input.program.id}:${Date.now()}`);

  return {
    runId,
    tenant: input.program.tenant,
    candidateCount: candidates.length,
    selected: selected ?? null,
    summary: `constraints=${filteredConstraints.windows.length} signals=${signals.length} ready=${windowSummary.signalCount}`,
    diagnostics,
    projectedMinutes: graph.timelineMinutes,
  };
};

export const enumerateSimulations = (programs: readonly CoordinationProgram[]): readonly SimulationResult[] =>
  programs.map((program, index) => simulateCoordinationRun({
    tenant: program.tenant,
    program,
    signalLimit: 3 + index,
    maxCandidates: 2 + Math.floor(program.steps.length / 2),
  }));

export const aggregateSimulationHealth = (results: readonly SimulationResult[]): number => {
  if (!results.length) return 0;

  const good = results.filter((result) => result.selected &&
    result.diagnostics.every((item) => item.severity !== 'error')).length;
  return Math.round((good / results.length) * 100) / 100;
};

const generateCandidateSeeds = (
  program: CoordinationProgram,
  signalLimit: number,
  maxCandidates: number,
): readonly CoordinationPlanCandidate[] => {
  const stepProfile = summarizeByStep(program.steps);
  const limitedSteps = Math.min(signalLimit, program.steps.length, maxCandidates);

  const seeds = constraintsProfile(program.constraints).slice(0, limitedSteps);
  return seeds.map((entry, index) => ({
    id: `${program.id}:candidate:${entry.constraintId}`,
    correlationId: `${program.id}:sim:${entry.constraintId}` as never,
    programId: program.id,
    runId: `${program.id}:sim:${index}` as never,
    tenant: program.tenant,
    steps: [...program.steps],
    sequence: [...program.steps].map((step) => step.id),
    metadata: {
      parallelism: Math.max(1, Math.min(16, stepProfile[index]?.risk ? 10 : 4)),
      expectedCompletionMinutes: Math.max(5, 30 + index * 4),
      riskIndex: stepProfile[index]?.risk ?? 0.5,
      resilienceScore: stepProfile[index]?.score ?? 0.5,
    },
    createdBy: 'simulator',
    createdAt: new Date().toISOString(),
  }));
};

const collectDiagnostics = (
  constraints: readonly CoordinationConstraint[],
  graph: ReturnType<typeof buildWorkflowGraph>,
  profile: ReturnType<typeof summarizeProgramQuality>,
  windowCount: number,
  baseline: CoordinationSelectionResult,
): readonly SimulationDiagnostic[] => {
  const warnings: SimulationDiagnostic[] = [];

  if (!constraints.length) {
    warnings.push({
      code: 'no-constraints',
      hint: 'Program has no constraints; policy defaults will dominate',
      severity: 'warn',
    });
  }

  if (windowCount === 0) {
    warnings.push({
      code: 'zero-policy-windows',
      hint: 'Policy windows are empty after constraint filtering',
      severity: 'error',
    });
  }

  if (graph.qualityScore < 0.4) {
    warnings.push({
      code: 'low-quality',
      hint: 'Quality score below execution threshold',
      severity: 'error',
    });
  }

  if (baseline.decision === 'blocked') {
    warnings.push({
      code: 'policy-blocked',
      hint: 'Baseline policy decision is blocked',
      severity: 'warn',
    });
  }

  if (profile.riskGrade === 'F') {
    warnings.push({
      code: 'risk-grade-f',
      hint: 'Risk grade requires manual override',
      severity: 'error',
    });
  }

  if (baseline.blockedConstraints.length > 0) {
    warnings.push({
      code: 'blocked-constraints',
      hint: `Blocked constraints: ${baseline.blockedConstraints.length}`,
      severity: 'warn',
    });
  }

  return warnings;
};

const selectFirstCandidate = (
  candidates: readonly CoordinationPlanCandidate[],
  program: CoordinationProgram,
): CoordinationPlanCandidate | null => {
  const selected = candidates.find((candidate) => createQualityGate(candidate, program.constraints));
  return selected ?? candidates.at(0) ?? null;
};
