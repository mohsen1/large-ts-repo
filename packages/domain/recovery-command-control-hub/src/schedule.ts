import { type HubControlWindow, type HubRunId, type WindowState } from './types';

export interface WindowBlock {
  readonly runId: HubRunId;
  readonly start: string;
  readonly end: string;
}

const addMinutes = (anchor: string, minutes: number): string => {
  const date = new Date(anchor);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
};

export const createControlWindow = (runId: HubRunId, startsAt: string, minutes = 90): HubControlWindow => ({
  id: `${runId}:window`,
  runId,
  startsAt,
  endsAt: addMinutes(startsAt, minutes),
  state: 'open',
});

export const sealWindow = (window: HubControlWindow): HubControlWindow => ({
  ...window,
  state: 'sealed',
});

export const closeWindow = (window: HubControlWindow): HubControlWindow => ({
  ...window,
  state: 'closed',
});

export const isWindowOpen = (window: HubControlWindow): boolean =>
  window.state === 'open' && new Date().getTime() <= Date.parse(window.endsAt);

export const timelineBlocks = (runId: HubRunId, start: string, count: number): readonly WindowBlock[] => {
  const safeCount = Math.max(1, Math.min(20, count));
  return Array.from({ length: safeCount }, (_, index) => {
    const blockStart = addMinutes(start, index * 5);
    return {
      runId,
      start: blockStart,
      end: addMinutes(blockStart, 5),
    };
  });
};

export const windowState = (state: WindowState): WindowState => (state === 'open' ? 'open' : state);
