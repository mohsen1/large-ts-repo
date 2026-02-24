import { FormEvent, useCallback, useMemo, useState } from 'react';
import { StudioMode } from '../models/policy-studio-types';

interface TemplateSpec {
  readonly templateId: string;
  readonly rendered: string;
  readonly variablesCount: number;
}

interface PolicyScenarioComposerProps {
  readonly templates: readonly TemplateSpec[];
  readonly mode: StudioMode;
  readonly onSubmit: (templateIds: readonly string[], dryRun: boolean) => Promise<void>;
}

const toModeLabel = (mode: StudioMode): string => {
  if (mode === 'design') return 'Design';
  if (mode === 'simulate') return 'Simulate';
  if (mode === 'execute') return 'Execute';
  return 'Observe';
};

export const PolicyScenarioComposer = ({ templates, mode, onSubmit }: PolicyScenarioComposerProps) => {
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [dryRun, setDryRun] = useState(true);
  const labels = useMemo(() => ({ design: 'dry design', execute: 'live execute', observe: 'observe', simulate: 'simulate' }), []);

  const available = templates.filter((template) => template.variablesCount < 12);
  const selectedIds = useMemo(() => Object.entries(selection).filter(([, value]) => value).map(([id]) => id), [selection]);
  const allSelected = available.length > 0 && available.every((template) => selection[template.templateId]);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelection({});
      return;
    }
    setSelection(
      available.reduce<Record<string, boolean>>((acc, template) => {
        acc[template.templateId] = true;
        return acc;
      }, {}),
    );
  }, [allSelected, available]);

  const toggleTemplate = useCallback((templateId: string) => {
    setSelection((current) => ({ ...current, [templateId]: !current[templateId] }));
  }, []);

  const onSubmitForm = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (selectedIds.length === 0) return;
    await onSubmit(selectedIds, dryRun);
  }, [dryRun, onSubmit, selectedIds]);

  return (
    <section>
      <h2>Scenario Composer</h2>
      <p>mode: {toModeLabel(mode)}</p>
      <form onSubmit={onSubmitForm}>
        <label htmlFor="toggle-all" style={{ display: 'block', marginBottom: '0.5rem' }}>
          <input id="toggle-all" type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all visible templates
        </label>
        <ul>
          {available.map((template) => (
            <li key={template.templateId} style={{ marginBottom: '0.5rem' }}>
              <label>
                <input
                  type="checkbox"
                  checked={selection[template.templateId] ?? false}
                  onChange={() => toggleTemplate(template.templateId)}
                />
                {template.templateId}
                <small> vars={template.variablesCount}</small>
              </label>
              <p style={{ margin: '0.25rem 0 0 1.25rem' }}>{template.rendered}</p>
            </li>
          ))}
        </ul>
        <label style={{ marginRight: '1rem' }}>
          <input type="checkbox" checked={dryRun} onChange={() => setDryRun((current) => !current)} /> {labels[mode] ?? 'run'}
        </label>
        <button type="submit" disabled={selectedIds.length === 0}>
          Run {selectedIds.length} template(s) {dryRun ? 'dry' : 'live'}
        </button>
      </form>
    </section>
  );
};

