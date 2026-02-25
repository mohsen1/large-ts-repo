import { useMemo, type ChangeEvent } from 'react';
import type { OrchestrationWorkspace, ScenarioDraft } from '../types.js';
import type { BlueprintManifest } from '@domain/recovery-cascade-orchestration';

export interface ScenarioComposerPanelProps<TBlueprint extends BlueprintManifest> {
  readonly draft: ScenarioDraft<TBlueprint>;
  readonly workspace: OrchestrationWorkspace<TBlueprint>;
  readonly onPatch: (next: Partial<ScenarioDraft<TBlueprint>>) => void;
}

export const ScenarioComposerPanel = <TBlueprint extends BlueprintManifest>({
  draft,
  workspace,
  onPatch,
}: ScenarioComposerPanelProps<TBlueprint>) => {
  const stageNames = useMemo(() => workspace.blueprint.stages.map((stage) => stage.name), [workspace.blueprint]);

  const onNotes = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onPatch({
      ...draft,
      notes: event.currentTarget.value,
    });
  };

  const onStageClick = (stageName: string) => {
    onPatch({
      ...draft,
      notes: `${draft.notes}\nSelected: ${stageName}`,
    });
  };

  return (
    <section>
      <h3>Scenario Composer</h3>
      <textarea value={draft.notes} onChange={onNotes} aria-label="Scenario notes" />
      <div className="scenario-stage-grid">
        {stageNames.map((stage) => (
          <button key={stage} type="button" onClick={() => onStageClick(stage)}>
            {stage}
          </button>
        ))}
      </div>
      <p>Selected stages: {workspace.selected.join(', ') || 'none'}</p>
    </section>
  );
};

export const mergeWorkspaceWithDraft = <
  TBlueprint extends BlueprintManifest,
>(
  workspace: OrchestrationWorkspace<TBlueprint>,
  draft: ScenarioDraft<TBlueprint>,
): OrchestrationWorkspace<TBlueprint> => ({
  ...workspace,
  blueprint: {
    ...workspace.blueprint,
    name: `${workspace.blueprint.name} + ${draft.notes.trim().slice(0, 16)}` || workspace.blueprint.name,
  },
});
