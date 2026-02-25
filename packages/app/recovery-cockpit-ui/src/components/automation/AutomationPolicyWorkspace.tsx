import { useMemo } from 'react';
import { type AutomationBlueprint } from '@domain/recovery-cockpit-orchestration-core';
import type { ReactElement } from 'react';

type WorkspaceProps = {
  readonly blueprint: AutomationBlueprint;
  readonly highlight: ReadonlyArray<number>;
  readonly onClose: () => void;
};

export const AutomationPolicyWorkspace = ({ blueprint, highlight, onClose }: WorkspaceProps): ReactElement => {
  const tags = blueprint.header.tags;
  const highlighted = useMemo(
    () => new Set(highlight.map((index) => String(index))),
    [highlight],
  );

  return (
    <aside style={{ padding: 12, border: '1px solid #445', borderRadius: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Blueprint Policy</h3>
        <button type="button" onClick={onClose}>
          close
        </button>
      </header>
      <dl>
        <dt>Blueprint</dt>
        <dd>{blueprint.header.blueprintName}</dd>
        <dt>Id</dt>
        <dd>{blueprint.header.blueprintId}</dd>
        <dt>Version</dt>
        <dd>{blueprint.header.version}</dd>
      </dl>
      <p>Tags</p>
      <ul>
        {tags.map((tag, index) => (
          <li key={tag} style={{ fontWeight: highlighted.has(String(index)) ? 'bold' : 'normal' }}>
            {tag}
          </li>
        ))}
      </ul>
      <p>{highlight.length} policy hints enabled.</p>
      <ul>
        {Object.entries(blueprint.policies).map(([key, value]) => (
          <li key={key}>
            <strong>{key}</strong>: {value}
          </li>
        ))}
      </ul>
    </aside>
  );
};
