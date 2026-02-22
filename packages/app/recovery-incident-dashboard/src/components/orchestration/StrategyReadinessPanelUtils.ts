export interface OrchestrationState {
  readonly tenant: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
}

export const strategyOverviewFromBoard = (state: OrchestrationState): readonly string[] => {
  return [
    `tenant:${state.tenant}`,
    `status:${state.status}`,
    `summary:${state.summary}`,
    ...state.details,
  ];
};
