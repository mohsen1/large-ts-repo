import { useMemo } from 'react';

import { useRecoveryDrillCatalog } from '../hooks/useRecoveryDrillCatalog';

interface RecoveryDrillCatalogPanelProps {
  readonly tenant: string;
  readonly onRunTemplate: (templateId: string) => void;
}

export const RecoveryDrillCatalogPanel = ({ tenant, onRunTemplate }: RecoveryDrillCatalogPanelProps) => {
  const { templates, selectedTemplateIds, starts, seedDemo } = useRecoveryDrillCatalog({ tenant });

  const selectedSet = useMemo(() => new Set(selectedTemplateIds), [selectedTemplateIds]);

  return (
    <section className="drill-catalog-panel">
      <header>
        <h2>Recovery Drill Catalog</h2>
        <button type="button" onClick={seedDemo}>
          Seed Demo Template
        </button>
      </header>
      <ul>
        {templates.map((template) => {
          const isSelected = selectedSet.size === 0 || selectedSet.has(template.templateId);
          return (
            <li key={template.templateId}>
              <span>{template.template.title}</span>
              <span>tenant:{template.tenantId}</span>
              <span>priority:{template.template.priority}</span>
              <span>selected:{String(isSelected)}</span>
              <button type="button" onClick={() => onRunTemplate(template.templateId)}>
                Run
              </button>
            </li>
          );
        })}
      </ul>
      <p>Total starts: {starts.length}</p>
    </section>
  );
};
