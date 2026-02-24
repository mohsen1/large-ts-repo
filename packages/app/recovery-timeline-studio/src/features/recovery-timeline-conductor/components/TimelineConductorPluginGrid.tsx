import { useMemo } from 'react';
import { useTimelineConductorPlugins, type ConductorPluginPreset } from '../hooks/useTimelineConductorPlugins';
import { type ConductorMode } from '@domain/recovery-timeline-orchestration';

interface TimelineConductorPluginGridProps {
  readonly mode: ConductorMode;
  readonly selectedPlugin: string | null;
  readonly onSelectPlugin: (plugin: string | null) => void;
}

function uniqueByPlugin(items: readonly string[]): readonly string[] {
  return [...new Set(items)];
}

function pluginPriority(plugin: string): number {
  return plugin.includes('simulate') ? 2 : plugin.includes('plan') ? 1 : 0;
}

export function TimelineConductorPluginGrid({
  mode,
  selectedPlugin,
  onSelectPlugin,
}: TimelineConductorPluginGridProps) {
  const preset = useTimelineConductorPlugins(mode);

  const options = useMemo(() => {
    const base = uniqueByPlugin(preset.plugins);
    const ranked = [...base].sort((left, right) => pluginPriority(right) - pluginPriority(left));

    return ranked.map((plugin) => ({
      id: plugin,
      selected: plugin === selectedPlugin,
      priority: pluginPriority(plugin),
    }));
  }, [mode, selectedPlugin, preset.plugins]);

  return (
    <section>
      <h3>Available Plugins</h3>
      <div>
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            style={{ fontWeight: option.selected ? 'bold' : 'normal' }}
            onClick={() => onSelectPlugin(option.selected ? null : option.id)}
          >
            {option.id} ({option.priority})
          </button>
        ))}
      </div>
      <small>Policy minConfidence: {preset.policy.minConfidence}</small>
    </section>
  );
}
