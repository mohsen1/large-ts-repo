import { parseAssessment, assessmentSchema } from './situation-schema';
import { buildPlanFromContext } from './situation-planner';
import type {
  SituationalAssessment,
  RecoveryWorkloadNode,
  SituationalSnapshot,
  SituationalSignal,
  PlanningContext,
  RecoveryPlanCandidate,
} from './situation-types';

const parseSafe = <T>(value: unknown, parser: (input: unknown) => T): T => {
  try {
    return parser(value);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid situational payload: ${error.message}`);
    }
    throw new Error('Invalid situational payload');
  }
};

export const parseSituationalAssessment = (value: unknown): SituationalAssessment =>
  parseSafe(value, (raw) => parseAssessment(raw) as SituationalAssessment);

export const hydrateAssessment = (
  node: RecoveryWorkloadNode,
  snapshot: SituationalSnapshot,
  signals: readonly SituationalSignal[],
  context: PlanningContext,
): SituationalAssessment => buildPlanFromContext(node, snapshot, signals, context);

export const serializePlan = (plan: RecoveryPlanCandidate): string => JSON.stringify(plan);

export const deserializePlan = (raw: string): RecoveryPlanCandidate =>
  parseSafe(JSON.parse(raw), (value: unknown) => {
    if (typeof value === 'object' && value !== null && 'planId' in value) {
      return value as RecoveryPlanCandidate;
    }
    throw new Error('Malformed plan payload');
  });

export const summarizeAssessment = (assessment: SituationalAssessment): string => {
  const commandIds = assessment.commands.map((command) => command.commandId).join(', ');
  return `${assessment.assessmentId}|${assessment.phase}|${assessment.status}|${assessment.plan.planId}|commands=${commandIds}`;
};
