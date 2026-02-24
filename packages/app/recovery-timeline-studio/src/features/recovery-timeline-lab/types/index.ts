export type TimelineLabMode = 'policy' | 'simulate' | 'ops';

export interface TimelineLabViewState {
  readonly timelineMode: TimelineLabMode;
  readonly panelCollapsed: boolean;
}
