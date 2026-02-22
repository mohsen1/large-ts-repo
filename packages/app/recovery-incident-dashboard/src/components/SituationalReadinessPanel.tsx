import { useMemo } from 'react';
import type { SituationalAssessment } from '@domain/recovery-situational-intelligence';
import type { RecoveryPlanCandidate } from '@domain/recovery-situational-intelligence';

const percentage = (value: number): string => `${Math.round(value * 100)}%`;

const assessRisk = (assessment: SituationalAssessment): { label: string; tone: string } => {
  if (assessment.weightedConfidence > 0.75) {
    return { label: 'Operationally Healthy', tone: 'ok' };
  }
  if (assessment.weightedConfidence > 0.45) {
    return { label: 'Caution', tone: 'warn' };
  }
  return { label: 'Critical', tone: 'danger' };
};

export const SituationalReadinessPanel = ({
  assessments,
  plans,
  selectedPlanId,
  onSelect,
}: {
  readonly assessments: readonly SituationalAssessment[];
  readonly plans: readonly RecoveryPlanCandidate[];
  readonly selectedPlanId?: string;
  readonly onSelect: (planId: string) => void;
}) => {
  const rows = useMemo(() => {
    return assessments.map((assessment) => {
      const risk = assessRisk(assessment);
      const plan = plans.find((entry) => entry.planId === assessment.plan.planId);
      return {
        assessment,
        risk,
        plan,
      };
    });
  }, [assessments, plans]);

  return (
    <section className="situational-readiness-panel">
      <header>
        <h2>Situational Readiness</h2>
        <p>Tracks recovery plans with plan confidence and active load impact.</p>
      </header>
      <ul className="situational-grid">
        {rows.map(({ assessment, risk, plan }) => {
          const selected = selectedPlanId === assessment.plan.planId;
          return (
            <li key={assessment.assessmentId} className={`readiness-row tone-${risk.tone} ${selected ? 'selected' : ''}`}>
              <div>
                <h3>{assessment.workload.name}</h3>
                <p>{assessment.phase} / {assessment.status}</p>
              </div>
              <div>
                <strong>Signal Signals:</strong> {assessment.signalCount}
              </div>
              <div>
                <strong>Confidence:</strong> {percentage(assessment.weightedConfidence)}
              </div>
              <div>
                <strong>Plan:</strong> {plan?.title ?? assessment.plan.title}
              </div>
              <div>
                <strong>RTO:</strong> {assessment.plan.estimatedRestorationMinutes}m
              </div>
              <button
                onClick={() => {
                  onSelect(assessment.plan.planId);
                }}
                type="button"
              >
                Inspect
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
