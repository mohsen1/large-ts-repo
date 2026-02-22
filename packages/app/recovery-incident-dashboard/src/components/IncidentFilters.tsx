import { useMemo, type ChangeEvent } from 'react';
import type { DashboardIncident } from '../types';

export interface IncidentFilters {
  readonly tenantId: string;
  readonly serviceName: string;
  readonly severity: string;
  readonly hasPlans: boolean;
  readonly query: string;
}

export interface IncidentFilterProps {
  readonly incidents: readonly DashboardIncident[];
  readonly value: IncidentFilters;
  readonly onChange: (next: IncidentFilters) => void;
}

const asValue = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): string =>
  event.currentTarget.value;

const uniqueValues = (items: readonly DashboardIncident[], selector: (item: DashboardIncident) => string): readonly string[] =>
  Array.from(new Set(items.map(selector).sort()));

export const IncidentFilters = ({ incidents, value, onChange }: IncidentFilterProps) => {
  const tenantOptions = useMemo(() => uniqueValues(incidents, (incident) => incident.scope.tenantId), [incidents]);
  const serviceOptions = useMemo(() => uniqueValues(incidents, (incident) => incident.scope.serviceName), [incidents]);
  const severityOptions = useMemo(() => uniqueValues(incidents, (incident) => incident.severity), [incidents]);

  const handleTenantChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...value,
      tenantId: asValue(event),
    });
  };

  const handleServiceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...value,
      serviceName: asValue(event),
    });
  };

  const handleSeverityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...value,
      severity: asValue(event),
    });
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      query: asValue(event),
    });
  };

  const handleHasPlans = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      hasPlans: event.currentTarget.checked,
    });
  };

  return (
    <section className="incident-filters">
      <label>
        Tenant:
        <select value={value.tenantId} onChange={handleTenantChange}>
          <option value="">all tenants</option>
          {tenantOptions.map((tenant) => (
            <option key={tenant} value={tenant}>
              {tenant}
            </option>
          ))}
        </select>
      </label>
      <label>
        Service:
        <select value={value.serviceName} onChange={handleServiceChange}>
          <option value="">all services</option>
          {serviceOptions.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
      </label>
      <label>
        Severity:
        <select value={value.severity} onChange={handleSeverityChange}>
          <option value="">all severities</option>
          {severityOptions.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
      </label>
      <label>
        Search:
        <input type="text" value={value.query} onChange={handleQueryChange} placeholder="title or id"/>
      </label>
      <label>
        <input type="checkbox" checked={value.hasPlans} onChange={handleHasPlans} />
        Only with plans
      </label>
    </section>
  );
};

export const applyIncidentFilters = (
  incidents: readonly DashboardIncident[],
  filters: IncidentFilters,
): readonly DashboardIncident[] =>
  incidents
    .filter((incident) => (filters.tenantId ? incident.scope.tenantId === filters.tenantId : true))
    .filter((incident) => (filters.serviceName ? incident.scope.serviceName === filters.serviceName : true))
    .filter((incident) => (filters.severity ? incident.severity === filters.severity : true))
    .filter((incident) => {
      if (filters.query.trim() === '') {
        return true;
      }
      const query = filters.query.toLowerCase();
      return incident.id.toLowerCase().includes(query) || incident.title.toLowerCase().includes(query);
    })
    .filter((incident) => (filters.hasPlans ? incident.labels.includes('planned') : true));
