import { useCallback, useState } from 'react';

import { useRecoveryDrillCatalog } from '../hooks/useRecoveryDrillCatalog';

export const RecoveryDrillOperationsPage = () => {
  const [tenant, setTenant] = useState('global');
  const { templates, runTemplate, metrics } = useRecoveryDrillCatalog({ tenant });

  const runHighest = useCallback(() => {
    const first = templates[0];
    if (!first) return;
    void runTemplate(first.templateId);
  }, [templates, runTemplate]);

  return (
    <section className="recovery-drill-operations-page">
      <h1>Drill Operations</h1>
      <input value={tenant} onChange={(event) => setTenant(event.target.value)} />
      <button type="button" onClick={runHighest}>
        Run first
      </button>
      <p>Metric rows: {metrics.length}</p>
      <ul>
        {templates.map((template) => (
          <li key={template.templateId}>
            {template.template.title} / {template.template.mode}
          </li>
        ))}
      </ul>
    </section>
  );
};
