import { z } from 'zod';
import type { CommandIntent, PriorityBand } from './command-intent';

export interface ConstraintPolicy {
  id: string;
  name: string;
  isHard: boolean;
  expression: string;
}

export type ConstraintViolation = {
  policyId: string;
  message: string;
  severity: PriorityBand;
};

export interface CommandCandidate {
  id: string;
  commandName: string;
  score: number;
  intent: CommandIntent;
  rationale: string[];
  assumptions: string[];
  constraints: ConstraintPolicy[];
}

export const candidateSchema = z.object({
  id: z.string().uuid(),
  commandName: z.string().min(1),
  score: z.number().min(0).max(1),
  intent: z.object({ id: z.string().uuid() }),
  rationale: z.array(z.string()),
  assumptions: z.array(z.string()),
  constraints: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      isHard: z.boolean(),
      expression: z.string(),
    }),
  ),
});

export interface FusedPlan {
  id: string;
  commandName: string;
  selectedAt: string;
  candidate: CommandCandidate;
  confidence: number;
  fallbackPlanIds: string[];
}

export const fusedPlanSchema = z.object({
  id: z.string().uuid(),
  commandName: z.string(),
  selectedAt: z.string().datetime(),
  candidate: candidateSchema,
  confidence: z.number().min(0).max(1),
  fallbackPlanIds: z.array(z.string()),
});

export function scoreCandidate(
  candidate: CommandCandidate,
  boost: number,
): CommandCandidate {
  return {
    ...candidate,
    score: Math.min(1, Math.max(0, candidate.score + boost)),
  };
}

export function validateConstraints(plan: FusedPlan): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const policy of plan.candidate.constraints) {
    const blocked = policy.expression.includes('disallow');
    if (blocked && plan.confidence > 0.8) {
      violations.push({
        policyId: policy.id,
        message: `${policy.name} disallows this operation under confidence ${plan.confidence}`,
        severity: 'critical',
      });
    }
  }

  return violations;
}
