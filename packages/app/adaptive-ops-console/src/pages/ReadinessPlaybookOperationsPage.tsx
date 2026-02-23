import { useState } from 'react';
import { useReadinessPlaybook, type HealthSeriesPoint } from '../hooks/useReadinessPlaybook';
import { ReadinessPlaybookTimeline } from '../components/readiness-lab/ReadinessPlaybookTimeline';
import { ReadinessRiskRadar } from '../components/readiness-lab/ReadinessRiskRadar';
import type { ReadinessPriority, ReadinessPlaybookTemplate } from '@domain/recovery-readiness/playbook-models';

interface PriorityFilterProps {
  selected: ReadinessPriority | undefined;
  onChange: (value: ReadinessPriority | undefined) => void;
}

const PriorityFilter = ({ selected, onChange }: PriorityFilterProps) => {
  const options: Array<ReadinessPriority | 'all'> = ['all', 'low', 'normal', 'high', 'critical'];

  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      Priority
      <select
        value={selected ?? 'all'}
        onChange={(event) => {
          const value = event.currentTarget.value as ReadinessPriority | 'all';
          onChange(value === 'all' ? undefined : value);
        }}
        style={{ marginLeft: 8 }}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
};

interface TemplatePanelProps {
  templates: ReadinessPlaybookTemplate[];
  snapshots: { template: ReadinessPlaybookTemplate; total: number; trend: string; buckets: HealthSeriesPoint[] }[];
  onSchedule: (priority: ReadinessPriority, template: ReadinessPlaybookTemplate) => Promise<boolean>;
}

const TemplatePanel = ({
  templates,
  snapshots,
  onSchedule,
}: TemplatePanelProps) => (
  <section>
    <h2>Candidate playbook timeline</h2>
    {templates.map((template) => {
      const snapshot = snapshots.find((entry) => entry.template.playbook.id === template.playbook.id);
      return (
        <article key={template.id} style={{ marginBottom: 12 }}>
          <ReadinessPlaybookTimeline
            playbook={template.playbook}
            runHistory={snapshot?.buckets ?? []}
            title={template.title}
            compact
          />
          <button
            type="button"
            onClick={async () => {
              await onSchedule(template.playbook.priority, template);
            }}
            style={{ marginTop: 8 }}
          >
            Schedule draft
          </button>
        </article>
      );
    })}
  </section>
);

export const ReadinessPlaybookOperationsPage = () => {
  const [search, setSearch] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<ReadinessPriority | undefined>(undefined);
  const result = useReadinessPlaybook({
    search,
    priority: selectedPriority,
    category: ['customer-impact', 'infrastructure'],
  });

  if (result.loading) {
    return <p>Loading readiness control plane...</p>;
  }

  if (result.error) {
    return <p role="alert">Unable to load readiness playbooks: {result.error}</p>;
  }

  return (
    <main
      style={{
        padding: 20,
        fontFamily: 'Inter, system-ui, sans-serif',
        background: 'linear-gradient(180deg,#f8faff,#ffffff)',
      }}
    >
      <h1>Readiness playbook operations lab</h1>
      <p>
        {result.scheduledCount + result.failedCount > 0
          ? `Last run: ${result.scheduledCount} scheduled, ${result.failedCount} failed`
          : 'No runs yet'}
      </p>

      <PriorityFilter selected={selectedPriority} onChange={setSelectedPriority} />
      <label style={{ display: 'block', marginBottom: 16 }}>
        Search
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
          }}
          placeholder="Search playbooks"
          style={{ marginLeft: 8 }}
        />
      </label>

      <section style={{ marginBottom: 20 }}>
        <ReadinessRiskRadar
          templates={result.templates}
          onPriorityChange={(priority) => {
            setSelectedPriority(priority);
          }}
        />
      </section>

      <TemplatePanel
        templates={result.templates}
        snapshots={result.healthSnapshots}
        onSchedule={async (priority, template) => {
          await result.schedule(priority, template);
          return true;
        }}
      />
      <footer style={{ marginTop: 24, color: '#495057' }}>
        {result.selectedTemplate ? (
          <p>Primary template: {result.selectedTemplate.title}</p>
        ) : (
          <p>No template selected</p>
        )}
      </footer>
    </main>
  );
};
