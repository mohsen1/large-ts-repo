import type {
  CadenceConstraintSet,
  CadencePlan,
  ConstraintViolation,
  FabricWorkspaceId,
  CadenceWindow,
} from './types';

export const makeDefaultConstraints = (tenantId: string): CadenceConstraintSet => ({
  tenant: {
    tenantId,
    region: 'us-east-1',
    environment: 'prod',
  },
  maxWindowMinutes: 90,
  maxParallelWindows: 4,
  minCoveragePct: 0.55,
  allowLateStart: true,
  maxCriticalitySkew: 0.45,
});

const violation = (
  rule: string,
  severity: ConstraintViolation['severity'],
  message: string,
  context: Record<string, unknown>,
): ConstraintViolation => ({ rule, severity, message, context });

export const assessPlan = (plan: CadencePlan): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];

  if (plan.windows.length > plan.constraints.maxWindowMinutes) {
    violations.push(
      violation('max-window-minutes', 'high', 'window budget exceeded', {
        observed: plan.windows.length,
        allowed: plan.constraints.maxWindowMinutes,
      }),
    );
  }

  const maxWindowLoad = Math.max(0, ...plan.windows.map((window) => window.nodeIds.length));
  if (maxWindowLoad > plan.constraints.maxParallelWindows) {
    violations.push(
      violation('max-parallel-windows', 'medium', 'parallelism exceeded', {
        observed: maxWindowLoad,
        allowed: plan.constraints.maxParallelWindows,
      }),
    );
  }

  const covered = new Set<string>(plan.windows.flatMap((window) => window.nodeIds)).size;
  const coverage = plan.windows.length > 0 ? covered / plan.windows.length : 0;
  if (coverage < plan.constraints.minCoveragePct) {
    violations.push(
      violation('min-coverage', 'medium', 'coverage is low', {
        observed: coverage,
        expected: plan.constraints.minCoveragePct,
      }),
    );
  }

  return violations;
};

export const canRunDraft = (draftViolations: readonly ConstraintViolation[]): boolean => draftViolations.length === 0;

export const normalizeWindowMode = (mode: CadenceWindow['requestedMode']): CadenceWindow['requestedMode'] => mode === 'burst' ? 'burst' : mode;
