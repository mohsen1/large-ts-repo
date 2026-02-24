import { memo } from 'react';

export interface LabPluginRibbonProps {
  readonly plugins: readonly string[];
  readonly selected?: string | null;
  readonly onSelect: (name: string) => void;
}

const ribbonStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  padding: '0.75rem',
  border: '1px solid #2c3a55',
  borderRadius: '0.5rem',
  background: '#0f1b2d',
};

const baseItemStyle: React.CSSProperties = {
  padding: '0.35rem 0.7rem',
  borderRadius: '999px',
  cursor: 'pointer',
  border: '1px solid #445',
  fontSize: '0.85rem',
};

export const LabPluginRibbon = memo(({ plugins, selected, onSelect }: LabPluginRibbonProps) => {
  return (
    <section style={ribbonStyle}>
      {plugins.map((plugin) => {
        const active = plugin === selected;
        return (
          <button
            key={plugin}
            type="button"
            onClick={() => onSelect(plugin)}
            style={{
              ...baseItemStyle,
              color: active ? '#0b101b' : '#e8eefc',
              background: active ? '#6fe3ff' : 'rgba(255,255,255,0.07)',
              borderColor: active ? '#4ac8e8' : '#5d6b87',
            }}
          >
            {plugin}
          </button>
        );
      })}
    </section>
  );
});
