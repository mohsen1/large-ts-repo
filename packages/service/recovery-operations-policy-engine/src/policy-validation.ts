import type { PolicyExecutionContext, PolicyValidationIssue, PolicyValidationReport } from './policy-types';

const isBlank = (value: string): boolean => value.trim().length === 0;

const severityRange = (severity: number): boolean => severity >= 0 && severity <= 10;
const confidenceRange = (confidence: number): boolean => confidence >= 0 && confidence <= 1;

const issuesForContext = (context: PolicyExecutionContext): PolicyValidationIssue[] => {
  const issues: PolicyValidationIssue[] = [];

  if (isBlank(context.runId)) {
    issues.push({ code: 'context.runId', message: 'runId missing', severity: 'critical', details: { runId: context.runId } });
  }

  if (context.readinessPlan.targets.length === 0) {
    issues.push({
      code: 'context.targets',
      message: 'no readiness targets',
      severity: 'high',
      details: { targetCount: context.readinessPlan.targets.length },
    });
  }

  if (!context.session.constraints.operatorApprovalRequired && context.readinessPlan.riskBand === 'red') {
    issues.push({
      code: 'context.approval',
      message: 'red risk band should request operator approval',
      severity: 'high',
      details: { riskBand: context.readinessPlan.riskBand },
    });
  }

  return issues;
};

const issuesForSignals = (signals: readonly PolicyExecutionContext['signals'][number][]): PolicyValidationIssue[] => {
  const issues: PolicyValidationIssue[] = [];

  if (signals.length === 0) {
    issues.push({
      code: 'signals.empty',
      message: 'no signals provided',
      severity: 'medium',
      details: { count: signals.length },
    });
  }

  const invalidSeverity = signals.find((signal) => !severityRange(signal.severity));
  if (invalidSeverity) {
    issues.push({
      code: 'signals.severity.range',
      message: 'signal severity out of range',
      severity: 'high',
      details: { signal: invalidSeverity.id, severity: invalidSeverity.severity },
    });
  }

  const invalidConfidence = signals.find((signal) => !confidenceRange(signal.confidence));
  if (invalidConfidence) {
    issues.push({
      code: 'signals.confidence.range',
      message: 'signal confidence out of range',
      severity: 'high',
      details: { signal: invalidConfidence.id, confidence: invalidConfidence.confidence },
    });
  }

  return issues;
};

export const validatePolicyContext = (context: PolicyExecutionContext): PolicyValidationReport => {
  const all = [...issuesForContext(context), ...issuesForSignals(context.signals)];
  const isValid = all.every((issue) => issue.severity === 'low' || issue.severity === 'medium');

  return {
    issues: all,
    isValid,
    recommendedFixes: all.map((issue) => `fix:${issue.code}`).slice(0, 8),
  };
};
