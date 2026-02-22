import { useMemo } from 'react';
import type { PortfolioDigest } from '@service/recovery-runner';

interface IncidentHealthPaletteProps {
  readonly title: string;
  readonly digest: PortfolioDigest | undefined;
  readonly onInspect: () => void;
}

interface HealthChip {
  readonly id: string;
  readonly tone: 'success' | 'neutral' | 'alert';
  readonly label: string;
}

const buildPalette = (digest: PortfolioDigest | undefined): readonly HealthChip[] => {
  if (!digest) {
    return [{ id: 'unknown', tone: 'neutral', label: 'No data' }];
  }
  return [
    {
      id: 'tenants',
      tone: digest.tenantCount > 4 ? 'alert' : 'success',
      label: `${digest.tenantCount} tenants`,
    },
    {
      id: 'plans',
      tone: digest.unhealthyPlanCount > 2 ? 'alert' : 'neutral',
      label: `unhealthy plan=${digest.unhealthyPlanCount}`,
    },
    {
      id: 'summary',
      tone: digest.summaryPlan.includes('0') ? 'success' : 'neutral',
      label: digest.summaryPlan,
    },
  ];
};

const toneClass = (tone: HealthChip['tone']) => {
  if (tone === 'success') return 'tone-success';
  if (tone === 'alert') return 'tone-alert';
  return 'tone-neutral';
};

export const IncidentHealthPalette = ({ title, digest, onInspect }: IncidentHealthPaletteProps) => {
  const palette = useMemo<readonly HealthChip[]>(() => buildPalette(digest), [digest]);

  return (
    <section className="incident-health-palette">
      <header>
        <h3>{title}</h3>
        <button type="button" onClick={onInspect}>
          inspect
        </button>
      </header>
      <div className="health-palette">
        {palette.map((chip: HealthChip) => (
          <span key={chip.id} className={toneClass(chip.tone)}>
            {chip.label}
          </span>
        ))}
      </div>
    </section>
  );
};
