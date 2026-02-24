import { useMemo } from 'react';
import {
  type ConductorMode,
  type ConductorPolicy,
} from '@domain/recovery-timeline-orchestration';

const pluginCatalog = {
  ingest: ['timeline-plugin/ingest-a', 'timeline-plugin/ingest-b', 'timeline-plugin/ingest-c'],
  plan: ['timeline-plugin/plan-a', 'timeline-plugin/plan-b'],
  simulate: ['timeline-plugin/simulate-a', 'timeline-plugin/simulate-b'],
  validate: ['timeline-plugin/validate-a', 'timeline-plugin/validate-b'],
} as const;

export interface ConductorPluginPreset {
  readonly mode: ConductorMode;
  readonly plugins: readonly string[];
  readonly policy: ConductorPolicy<'adaptive'>;
}

export function useTimelineConductorPlugins(mode: ConductorMode): ConductorPluginPreset {
  return useMemo(() => {
    const plugins = {
      observe: ['timeline-plugin/ingest-a'],
      simulate: pluginCatalog.simulate,
      stabilize: pluginCatalog.validate,
    }[mode] ?? pluginCatalog.ingest;

    return {
      mode,
      plugins,
      policy: {
        profile: 'adaptive',
        minConfidence: mode === 'simulate' ? 0.9 : 0.65,
        sampleWindow: mode === 'stabilize' ? 60 : 30,
        allowPartial: mode !== 'simulate',
      },
    };
  }, [mode]);
}
