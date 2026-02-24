import type { StudioConfigForm } from '../types';

interface StudioHeaderProps {
  readonly tenant: string;
  readonly workspace: string;
  readonly config: StudioConfigForm;
}

const formatTagList = (tags: readonly string[]): string => tags.join(' · ');

export const StudioHeader = ({ tenant, workspace, config }: StudioHeaderProps) => (
  <header>
    <h1>Recovery Orchestration Studio</h1>
    <p>{`${tenant} / ${workspace}`}</p>
    <p>{`limit=${config.limitMs}ms`}</p>
    <p>{`tags: ${formatTagList(config.tags)}`}</p>
  </header>
);
