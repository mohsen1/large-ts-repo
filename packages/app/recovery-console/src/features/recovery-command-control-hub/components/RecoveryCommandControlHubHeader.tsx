import { type ChangeEvent } from 'react';
import type { ControlHubFilter } from '../types';

interface RecoveryCommandControlHubHeaderProps {
  readonly tenant: string;
  readonly notes: readonly string[];
  readonly filter: ControlHubFilter;
  readonly onFilterChange: (next: ControlHubFilter) => void;
}

export const RecoveryCommandControlHubHeader = ({ tenant, notes, filter, onFilterChange }: RecoveryCommandControlHubHeaderProps) => {
  const onTenantChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onFilterChange({ ...filter, tenant: event.target.value });
  };

  const onBandChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const nextBand = event.target.value === 'all' ? undefined : (event.target.value as ControlHubFilter['impactBand']);
    onFilterChange({ ...filter, impactBand: nextBand });
  };

  return (
    <section>
      <h2>Recovery Command Control Hub</h2>
      <p>{`tenant: ${tenant}`}</p>
      <label>
        Tenant
        <input value={filter.tenant} onChange={onTenantChange} />
      </label>
      <label>
        Band
        <select value={filter.impactBand ?? 'all'} onChange={onBandChange}>
          <option value="all">all</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </label>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
};
