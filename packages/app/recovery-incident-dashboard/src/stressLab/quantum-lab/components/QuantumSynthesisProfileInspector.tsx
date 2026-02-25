import { useMemo } from 'react';
import type { ScenarioProfile } from '@domain/recovery-scenario-lens';

export interface QuantumSynthesisProfileInspectorProps {
  readonly profile: ScenarioProfile;
  readonly onCopy: (value: string) => void;
}

const toTag = (value: number): string => `#${value}`;

export const QuantumSynthesisProfileInspector = ({
  profile,
  onCopy,
}: QuantumSynthesisProfileInspectorProps) => {
  const policyCount = useMemo(() => profile.policyIds.length, [profile.policyIds]);
  const maxRisk = useMemo(() => `${profile.maxBlastRadius}/5`, [profile.maxBlastRadius]);

  return (
    <section style={{ border: '1px solid #d0d0d0', borderRadius: 12, padding: 12 }}>
      <h3>Profile Inspector</h3>
      <p style={{ marginTop: 0 }}>
        <strong>id:</strong> {profile.profileId}
      </p>
      <p>
        <strong>name:</strong> {profile.name}
      </p>
      <p>
        <strong>parallelism:</strong> {toTag(profile.maxParallelism)}
      </p>
      <p>
        <strong>max blast:</strong> {maxRisk}
      </p>
      <p>
        <strong>runtime ms:</strong> {Number(profile.maxRuntimeMs)}
      </p>
      <p>
        <strong>manual override:</strong> {profile.allowManualOverride ? 'on' : 'off'}
      </p>
      <p>
        <strong>policy tags:</strong> {policyCount}
      </p>
      <button
        type="button"
        onClick={() =>
          onCopy(
            JSON.stringify(
              {
                profileId: profile.profileId,
                name: profile.name,
                maxParallelism: profile.maxParallelism,
                maxBlastRadius: profile.maxBlastRadius,
                maxRuntimeMs: profile.maxRuntimeMs,
                allowManualOverride: profile.allowManualOverride,
                policyIds: profile.policyIds,
              },
              null,
              2,
            ),
          )
        }
      >
        Copy profile JSON
      </button>
    </section>
  );
};

