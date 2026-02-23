import { useMemo } from 'react';
import type { CommandSurface } from '@domain/recovery-ops-orchestration-surface';

interface RecoveryOpsSurfaceCardProps {
  readonly surface: CommandSurface;
  readonly selected: boolean;
  readonly onSelect: (surface: CommandSurface) => void;
}

const styleForRisk = (risk: string): { bg: string; border: string } => {
  if (risk === 'critical') {
    return { bg: '#ffebee', border: '#f44336' };
  }
  if (risk === 'high') {
    return { bg: '#fff3e0', border: '#fb8c00' };
  }
  if (risk === 'medium') {
    return { bg: '#fffde7', border: '#fdd835' };
  }
  return { bg: '#f1f8e9', border: '#7cb342' };
};

export const RecoveryOpsSurfaceCard = ({ surface, selected, onSelect }: RecoveryOpsSurfaceCardProps) => {
  const signalCount = useMemo(() => surface.signals.length, [surface.signals.length]);
  const planCount = useMemo(() => surface.availablePlans.length, [surface.availablePlans.length]);

  const highestRisk = useMemo(() => {
    return surface.availablePlans.reduce((worst, plan) => {
      const rank = ['low', 'medium', 'high', 'critical'];
      return rank.indexOf(plan.riskLevel) > rank.indexOf(worst.riskLevel) ? plan : worst;
    }, surface.availablePlans[0] ?? undefined);
  }, [surface.availablePlans]);

  const colors = useMemo(() => styleForRisk(highestRisk?.riskLevel ?? 'low'), [highestRisk?.riskLevel]);

  return (
    <button
      type="button"
      onClick={() => onSelect(surface)}
      style={{
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${selected ? colors.border : '#d1d5db'}`,
        textAlign: 'left',
        background: selected ? colors.bg : '#ffffff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>{surface.scenarioId}</strong>
        <span>{surface.metadata.environment}</span>
      </div>
      <div>{surface.id}</div>
      <div>{signalCount} signal(s) · {planCount} plan(s)</div>
      <div>highest risk: {highestRisk?.riskLevel ?? 'n/a'}</div>
    </button>
  );
};
