export interface Window {
  start: string;
  end: string;
  scope: string[];
  reason: string;
}

export interface MaintenancePlan {
  id: string;
  windows: Window[];
}

export const withPadding = (window: Window, minutes: number): Window => ({
  ...window,
  start: new Date(Date.parse(window.start) - minutes * 60_000).toISOString(),
  end: new Date(Date.parse(window.end) + minutes * 60_000).toISOString(),
});

export const isInside = (window: Window, at: string): boolean => {
  const value = Date.parse(at);
  return value >= Date.parse(window.start) && value <= Date.parse(window.end);
};

export const openFor = (window: Window): number => Math.max(0, Date.parse(window.end) - Date.parse(window.start));
