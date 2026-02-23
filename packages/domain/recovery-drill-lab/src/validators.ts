import type { DrillRunQuery } from './types';

export interface ValidationError {
  readonly code: string;
  readonly message: string;
}

export const validateQueryWindow = (query: DrillRunQuery): readonly ValidationError[] => {
  if (!query.workspaceId && !query.scenarioId) {
    return [{ code: 'QUERY_EMPTY', message: 'workspaceId or scenarioId should be set for query context' }];
  }
  if (query.from && query.to && query.from > query.to) {
    return [{ code: 'INVALID_WINDOW', message: 'from must be before to' }];
  }
  return [];
};
