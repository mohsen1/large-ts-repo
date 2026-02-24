import { useMemo } from 'react';
import { PolicyPolicyArtifact } from '@service/policy-orchestration-engine/lab-orchestrator';

interface PolicyLabTimelineProps {
  values: readonly PolicyPolicyArtifact[];
}

const renderPoint = (value: PolicyPolicyArtifact): string => `${value.title}: ${value.value}`;

export const PolicyLabTimeline = ({ values }: PolicyLabTimelineProps) => {
  const points = useMemo(
    () => values.map((entry) => entry).toSorted((left, right) => String(right.value).localeCompare(String(left.value))),
    [values],
  );

  return (
    <section>
      <h3>Telemetry Timeline</h3>
      {points.length === 0 ? (
        <p>No timeline points yet.</p>
      ) : (
        <ol>
          {points.map((entry) => (
            <li key={`${entry.title}:${entry.value}`}>{renderPoint(entry)}</li>
          ))}
        </ol>
      )}
    </section>
  );
};
