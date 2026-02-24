import { useMemo } from 'react';
import { type ContinuitySummary, type ContinuityTemplate } from '@domain/recovery-incident-workflows';
import type { ContinuityApiSummary } from '@service/recovery-runner';

type ApiSummary = ReturnType<typeof import('@service/recovery-runner').toApiSummary>;

export interface ContinuityRunbookSummaryCardProps {
  readonly summary: ContinuitySummary;
  readonly templates: readonly ContinuityTemplate[];
  readonly apiSummary: ContinuityApiSummary | ApiSummary;
}

export const ContinuityRunbookSummaryCard = ({
  summary,
  templates,
  apiSummary,
}: ContinuityRunbookSummaryCardProps) => {
  const riskLevel = useMemo(() => {
    if (summary.score > 10) {
      return 'high';
    }
    if (summary.score > 5) {
      return 'medium';
    }
    return 'low';
  }, [summary.score]);

  const templateTitles = useMemo(
    () => templates.map((template) => template.title).join(', '),
    [templates],
  );

  return (
    <article>
      <header>
        <h3>Workspace summary</h3>
        <span>{`risk: ${riskLevel}`}</span>
      </header>
      <ul>
        <li>{`status: ${summary.status}`}</li>
        <li>{`score: ${summary.score}`}</li>
        <li>{`templates: ${templates.length}`}</li>
        <li>{`api policy count: ${apiSummary.policyCount}`}</li>
        <li>{`template titles: ${templateTitles}`}</li>
      </ul>
    </article>
  );
};
