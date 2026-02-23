import { useMemo } from 'react';
import type { RecoveryPlaybookModel, HealthIndicator, DriftSignal } from '@domain/recovery-playbook-orchestration';

interface Props {
  readonly playbook: RecoveryPlaybookModel;
  readonly signals: readonly DriftSignal[];
}

export const usePlaybookHealthProjection = ({ playbook, signals }: Props) => {
  const indicators: HealthIndicator[] = useMemo(() => {
    const baseScore = Math.max(0, Math.round(playbook.confidence * 100));
    const critical = signals.filter((signal) => signal.severity === 'critical').length;
    const high = signals.filter((signal) => signal.severity === 'high').length;
    const medium = signals.filter((signal) => signal.severity === 'medium').length;

    return [
      {
        key: 'overall-confidence',
        score: baseScore,
        band: baseScore > 85 ? 'green' : baseScore > 65 ? 'amber' : 'red',
        reason: 'playbook confidence calibration',
      },
      {
        key: 'criticality-load',
        score: critical,
        band: critical > 0 ? 'red' : high > 2 ? 'amber' : 'green',
        reason: 'critical and high severity signals',
      },
      {
        key: 'graph-depth',
        score: Object.keys(playbook.scenarioGraph.nodes).length,
        band: Object.keys(playbook.scenarioGraph.nodes).length > 7 ? 'amber' : 'green',
        reason: `scenario count ${Object.keys(playbook.scenarioGraph.nodes).length}`,
      },
      {
        key: 'risk-load',
        score: medium + high,
        band: medium + high > 4 ? 'amber' : 'green',
        reason: `medium+high signals ${medium + high}`,
      },
    ];
  }, [playbook, signals]);

  const isHighRisk = indicators.some((indicator) => indicator.band === 'red');
  const trend = indicators.reduce((acc, indicator) => {
    if (indicator.band === 'red') {
      return 'degrading' as const;
    }
    if (indicator.band === 'amber' && acc === 'improving') {
      return 'improving' as const;
    }
    return acc;
  }, 'improving' as 'improving' | 'flat' | 'degrading');

  return {
    indicators,
    isHighRisk,
    trend,
    score: indicators.reduce((acc, indicator) => acc + indicator.score, 0) / indicators.length,
  };
};
