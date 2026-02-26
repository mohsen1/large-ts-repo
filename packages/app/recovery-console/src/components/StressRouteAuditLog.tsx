import { type ReactElement, type ReactNode } from 'react';
import { routeConstraintSet, recoveryRouteTemplates, type RecoveryRouteTemplate } from '../services/recoveryStressAdapter';

interface Props {
  readonly tenant: string;
  readonly onSelect?: (template: RecoveryRouteTemplate) => void;
  readonly selectedTemplate?: RecoveryRouteTemplate;
}

type AuditLogEntry = {
  readonly icon: 'success' | 'warn' | 'info';
  readonly template: RecoveryRouteTemplate;
  readonly index: number;
  readonly label: string;
};

const severityFromIndex = (index: number): 'success' | 'warn' | 'info' => {
  if (index % 3 === 0) {
    return 'warn';
  }
  if (index % 5 === 0) {
    return 'info';
  }
  return 'success';
};

const renderEntry = ({ icon, template, label, index }: AuditLogEntry): ReactNode => {
  return (
    <li key={`${template}-${index}`} className={`audit-${icon}`}>
      <strong>{icon.toUpperCase()}</strong>
      <span>{label}</span>
      <small>{template}</small>
    </li>
  );
};

export const StressRouteAuditLog = ({ tenant, onSelect, selectedTemplate }: Props): ReactElement => {
  const entries: readonly AuditLogEntry[] = recoveryRouteTemplates.map((template, index) => ({
    icon: severityFromIndex(index),
    template,
    index,
    label: `${tenant}-${routeConstraint(index)}-${index % 3}`,
  }));

  const solved = routeConstraintSet.filter((entry) => entry.phase === 'draft' || entry.phase === 'apply');

  return (
    <section className="stress-route-audit-log">
      <h3>Route audit log</h3>
      <p>
        Tenant: {tenant} | Active constraints: {solved.length} / {routeConstraintSet.length}
      </p>
      <ul>{entries.map((entry) => renderEntry(entry))}</ul>
      <div className="selected-template">
        <span>Selected: {selectedTemplate ?? 'none'}</span>
      </div>
      <div className="audit-actions">
        {recoveryRouteTemplates.map((template, index) => (
          <button
            key={template}
            type="button"
            onClick={() => {
              onSelect?.(template);
            }}
          >
            Select {index + 1}
          </button>
        ))}
      </div>
    </section>
  );
};

const routeConstraint = (index: number): string => {
  const constraint = routeConstraintSet[index % routeConstraintSet.length];
  return `${constraint.solver}-${constraint.phase}-${constraint.retries}`;
};
